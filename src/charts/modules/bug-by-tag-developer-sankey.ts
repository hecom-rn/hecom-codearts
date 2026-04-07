import { IssueDetail } from '../../types';
import { ChartModule } from '../chart.interface';

export const bugByTagDeveloperSankeyChart: ChartModule = {
  title: '开发人员-标签桑基图',
  buildOption(bugs: IssueDetail[]): object {
    const edgeMap = new Map<string, number>();

    bugs.forEach((bug) => {
      if (!bug.tag_list || bug.tag_list.length === 0) return;
      const developer = bug.developer?.nick_name?.trim() || '未指派';
      bug.tag_list.forEach((tag) => {
        const key = `${developer}|||${tag.name}`;
        edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
      });
    });

    // Top 20 条边（按数量降序）
    const top20Edges = Array.from(edgeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // 从 Top 20 边中提取涉及的所有节点
    const nodeSet = new Set<string>();
    top20Edges.forEach(([key]) => {
      const [dev, tag] = key.split('|||');
      nodeSet.add(`dev:${dev}`);
      nodeSet.add(`tag:${tag}`);
    });

    const nodes = Array.from(nodeSet).map((n) => ({ name: n.replace(/^(dev:|tag:)/, '') }));

    // 构造边数组，source/target 使用去掉前缀的名称
    const links = top20Edges.map(([key, value]) => {
      const [dev, tag] = key.split('|||');
      return { source: dev, target: tag, value };
    });

    // 处理 source 和 target 同名冲突：为开发人员节点加后缀
    const tagNames = new Set(top20Edges.map(([key]) => key.split('|||')[1]));
    const devNames = new Set(top20Edges.map(([key]) => key.split('|||')[0]));
    const conflicts = new Set([...tagNames].filter((t) => devNames.has(t)));

    const finalNodes: { name: string }[] = [];
    const nameMap = new Map<string, string>(); // original prefixed key → display name

    Array.from(nodeSet).forEach((n) => {
      const isDevPrefix = n.startsWith('dev:');
      const rawName = n.replace(/^(dev:|tag:)/, '');
      let displayName = rawName;
      if (isDevPrefix && conflicts.has(rawName)) {
        displayName = `${rawName}（开发）`;
      }
      nameMap.set(n, displayName);
      finalNodes.push({ name: displayName });
    });

    const finalLinks = top20Edges.map(([key, value]) => {
      const [dev, tag] = key.split('|||');
      const sourceName = nameMap.get(`dev:${dev}`) || dev;
      const targetName = nameMap.get(`tag:${tag}`) || tag;
      return { source: sourceName, target: targetName, value };
    });

    // 消除 nodes 和 links 中的重复节点引用（避免 ECharts sankey 报错）
    void nodes;
    void links;

    return {
      tooltip: { trigger: 'item', triggerOn: 'mousemove' },
      series: [
        {
          type: 'sankey',
          data: finalNodes,
          links: finalLinks,
          emphasis: { focus: 'adjacency' },
          lineStyle: { color: 'gradient', curveness: 0.5 },
          label: { position: 'right' },
        },
      ],
    };
  },
};
