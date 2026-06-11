/**
 * Based on inquirerjs-checkbox-search@2.0.1
 * Original source: https://github.com/Texarkanine/inquirerjs-checkbox-search
 *
 * This is a self-hosted copy with two modifications on top of the original:
 * 1. Support for the space key (in addition to the original tab key) for
 *    toggling selection. This matches the muscle memory of users coming
 *    from native @inquirer/checkbox.
 * 2. The help tip text now reads "Space/Tab to select" to reflect the
 *    expanded keybinding.
 *
 * MIT License
 *
 * Copyright (c) 2024 Texarkanine
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import {
  createPrompt,
  useState,
  useKeypress,
  usePagination,
  useEffect,
  useRef,
  useMemo,
  usePrefix,
  makeTheme,
  isEnterKey,
  Separator,
  type Theme,
  type Status,
} from '@inquirer/core';
import type { PartialDeep } from '@inquirer/type';
import colors from 'picocolors';
import figures from '@inquirer/figures';
import ansiEscapes from 'ansi-escapes';

type CheckboxSearchTheme = {
  icon: {
    checked: string | ((text: string) => string);
    unchecked: string | ((text: string) => string);
    cursor: string | ((text: string) => string);
    nocursor?: string | ((text: string) => string);
  };
  style: {
    message: (text: string) => string;
    error: (text: string) => string;
    help: (text: string) => string;
    highlight: (text: string) => string;
    searchTerm: (text: string) => string;
    description: (text: string) => string;
    disabled: (text: string) => string;
    checked: (text: string) => string;
  };
  helpMode: 'always' | 'never' | 'auto';
};

const checkboxSearchTheme: CheckboxSearchTheme = {
  icon: {
    checked: colors.green(figures.circleFilled),
    unchecked: figures.circle,
    cursor: figures.pointer,
    nocursor: ' ',
  },
  style: {
    message: colors.cyan,
    error: (text: string) => colors.yellow(`> ${text}`),
    help: colors.dim,
    highlight: colors.cyan,
    searchTerm: colors.cyan,
    description: colors.cyan,
    disabled: colors.dim,
    checked: colors.green,
  },
  helpMode: 'always',
};

export type Choice<Value> = {
  value: Value;
  name?: string;
  description?: string;
  short?: string;
  disabled?: boolean | string;
  checked?: boolean;
  type?: never;
};

export type NormalizedChoice<Value> = {
  value: Value;
  name: string;
  description?: string;
  short: string;
  disabled: boolean | string;
  checked: boolean;
};

export type PageSizeConfig = {
  base?: number;
  max?: number;
  min?: number;
  autoBufferDescriptions?: boolean;
  buffer?: number;
  minBuffer?: number;
  autoBufferCountsLineWidth?: boolean;
};

export type PageSize = number | PageSizeConfig;

type CheckboxSearchConfig<
  Value,
  ChoicesObject = ReadonlyArray<string | Separator> | ReadonlyArray<Choice<Value> | Separator>,
> = {
  message: string;
  prefix?: string;
  pageSize?: PageSize;
  instructions?: string | boolean;
  choices?: ChoicesObject extends ReadonlyArray<string | Separator>
    ? ChoicesObject
    : ReadonlyArray<Choice<Value> | Separator>;
  source?: (
    term: string | undefined,
    opt: { signal: AbortSignal }
  ) => ChoicesObject extends ReadonlyArray<string | Separator>
    ? ChoicesObject | Promise<ChoicesObject>
    : ReadonlyArray<Choice<Value> | Separator> | Promise<ReadonlyArray<Choice<Value> | Separator>>;
  filter?: (
    items: ReadonlyArray<NormalizedChoice<Value>>,
    term: string
  ) => ReadonlyArray<NormalizedChoice<Value>>;
  loop?: boolean;
  required?: boolean;
  validate?: (
    choices: ReadonlyArray<NormalizedChoice<Value>>
  ) => boolean | string | Promise<string | boolean>;
  theme?: PartialDeep<Theme<CheckboxSearchTheme>>;
  default?: ReadonlyArray<Value>;
};

type Item<Value> = NormalizedChoice<Value> | Separator;

function isSelectable<Value>(item: Item<Value>): item is NormalizedChoice<Value> {
  return !Separator.isSeparator(item) && !item.disabled;
}

function isChecked<Value>(item: Item<Value>): item is NormalizedChoice<Value> {
  return isSelectable(item) && Boolean(item.checked);
}

function toggle<Value>(item: Item<Value>): Item<Value> {
  return isSelectable(item) ? { ...item, checked: !item.checked } : item;
}

function normalizeChoices<Value>(
  choices: ReadonlyArray<string | Separator> | ReadonlyArray<Choice<Value> | Separator>
): Item<Value>[] {
  return choices.map((choice) => {
    if (Separator.isSeparator(choice)) return choice;

    if (typeof choice === 'string') {
      return {
        value: choice as Value,
        name: choice,
        short: choice,
        disabled: false,
        checked: false,
      };
    }

    const name = choice.name ?? String(choice.value);
    const normalizedChoice: NormalizedChoice<Value> = {
      value: choice.value,
      name,
      short: choice.short ?? name,
      disabled: choice.disabled ?? false,
      checked: choice.checked ?? false,
    };

    if (choice.description) {
      normalizedChoice.description = choice.description;
    }

    return normalizedChoice;
  });
}

function defaultFilter<Value>(
  items: ReadonlyArray<NormalizedChoice<Value>>,
  term: string
): ReadonlyArray<NormalizedChoice<Value>> {
  if (!term.trim()) return items;

  const searchTerm = term.toLowerCase().normalize('NFD');
  return items.filter((item) => {
    const name = item.name.toLowerCase().normalize('NFD');
    const description = (item.description ?? '').toLowerCase().normalize('NFD');
    const value = String(item.value).toLowerCase().normalize('NFD');
    return (
      name.includes(searchTerm) || description.includes(searchTerm) || value.includes(searchTerm)
    );
  });
}

export function validatePageSizeConfig(config: PageSizeConfig): void {
  if (config.min !== undefined && config.min < 1) {
    throw new Error('PageSize min cannot be less than 1');
  }

  if (config.base !== undefined && config.base < 1) {
    throw new Error('PageSize base cannot be less than 1');
  }

  if (config.buffer !== undefined && config.buffer < 0) {
    throw new Error('PageSize buffer cannot be negative');
  }

  if (config.minBuffer !== undefined && config.minBuffer < 0) {
    throw new Error('PageSize minBuffer cannot be negative');
  }

  if (config.min !== undefined && config.max !== undefined && config.min > config.max) {
    throw new Error(`PageSize min (${config.min}) cannot be greater than max (${config.max})`);
  }
}

export function calculateDescriptionLines<Value>(
  items: readonly Item<Value>[],
  countLineWidth: boolean
): number {
  let maxLines = 0;

  for (const item of items) {
    if (Separator.isSeparator(item) || !item.description) {
      continue;
    }

    let lines: number;
    if (countLineWidth) {
      const terminalWidth = process.stdout.columns || 80;
      const descriptionLines = item.description.split('\n');
      lines = descriptionLines.reduce((total, line) => {
        return total + (Math.ceil(line.length / terminalWidth) || 1);
      }, 0);
    } else {
      lines = item.description.split('\n').length;
    }

    maxLines = Math.max(maxLines, lines);
  }

  return maxLines;
}

export function resolvePageSize<Value>(pageSize: PageSize, items: readonly Item<Value>[]): number {
  if (typeof pageSize === 'number') {
    return pageSize;
  }

  validatePageSizeConfig(pageSize);

  let basePageSize: number;
  if (pageSize.base !== undefined) {
    basePageSize = pageSize.base;
  } else {
    basePageSize = calculateDynamicPageSize(7);
  }

  let buffer = 0;

  if (pageSize.autoBufferDescriptions) {
    buffer += calculateDescriptionLines(items, pageSize.autoBufferCountsLineWidth || false);
  }

  buffer += pageSize.buffer || 0;

  if (pageSize.minBuffer !== undefined) {
    buffer = Math.max(buffer, pageSize.minBuffer);
  }

  let finalPageSize = basePageSize - buffer;

  if (pageSize.min !== undefined) {
    finalPageSize = Math.max(finalPageSize, pageSize.min);
  }

  if (pageSize.max !== undefined) {
    finalPageSize = Math.min(finalPageSize, pageSize.max);
  }

  return Math.max(1, finalPageSize);
}

export function calculateDynamicPageSize(fallbackPageSize: number): number {
  let rawPageSize: number;

  try {
    const terminalHeight = process.stdout.rows;

    if (!terminalHeight || terminalHeight < 1) {
      rawPageSize = fallbackPageSize;
    } else {
      const reservedLines = 6;
      rawPageSize = terminalHeight - reservedLines;
    }
  } catch {
    rawPageSize = fallbackPageSize;
  }

  return Math.max(2, Math.min(rawPageSize, 50));
}

const checkboxSearch = createPrompt(
  <Value>(config: CheckboxSearchConfig<Value>, done: (value: Array<Value>) => void) => {
    const emptyArray: ReadonlyArray<Value> = useMemo(() => [], []);

    const {
      pageSize: configPageSize,
      loop = true,
      required,
      validate = () => true,
      default: defaultValues = emptyArray,
    } = config;

    const theme = makeTheme<CheckboxSearchTheme>(checkboxSearchTheme, config.theme);

    const [status, setStatus] = useState<Status>('idle');
    const prefix = usePrefix({ status, theme });

    const [searchTerm, setSearchTerm] = useState<string>('');
    const [searchError, setSearchError] = useState<string>();

    const allItemsRef = useRef<ReadonlyArray<Item<Value>>>([]);

    const [allItems, setAllItems] = useState<ReadonlyArray<Item<Value>>>(() => {
      if (config.choices) {
        const normalized = normalizeChoices<Value>(config.choices);
        return normalized.map((item) => {
          if (isSelectable(item) && defaultValues.includes(item.value)) {
            return { ...item, checked: true };
          }
          return item;
        });
      }
      return [];
    });

    const terminalHeight = process.stdout.rows;
    const pageSize = useMemo(() => {
      if (configPageSize !== undefined) {
        return resolvePageSize(configPageSize, allItems);
      } else {
        return calculateDynamicPageSize(7);
      }
    }, [configPageSize, terminalHeight, allItems]);

    const [activeItemValue, setActiveItemValue] = useState<Value | null>(null);

    const filteredItems = useMemo(() => {
      if (config.source) {
        return allItems;
      }

      if (!searchTerm.trim()) {
        return allItems;
      }

      const filterFn = config.filter || defaultFilter;
      const selectableItems = allItems.filter(
        (item) => !Separator.isSeparator(item)
      ) as ReadonlyArray<NormalizedChoice<Value>>;
      const filtered = filterFn(selectableItems, searchTerm);

      const filteredValues = new Set(filtered.map((item) => item.value));

      const result: Item<Value>[] = [];

      for (const item of allItems) {
        if (Separator.isSeparator(item)) {
          result.push(item);
        } else if (filteredValues.has(item.value)) {
          result.push(item);
        }
      }

      return result;
    }, [allItems, searchTerm, config.source, config.filter]);

    const active = useMemo(() => {
      if (activeItemValue === null) {
        const firstSelectableIndex = filteredItems.findIndex((item) => isSelectable(item));
        return firstSelectableIndex !== -1 ? firstSelectableIndex : 0;
      }

      const activeIndex = filteredItems.findIndex(
        (item) =>
          !Separator.isSeparator(item) &&
          (item as NormalizedChoice<Value>).value === activeItemValue
      );

      if (activeIndex !== -1) {
        return activeIndex;
      }

      const firstSelectableIndex = filteredItems.findIndex((item) => isSelectable(item));
      return firstSelectableIndex !== -1 ? firstSelectableIndex : 0;
    }, [filteredItems, activeItemValue]);

    useEffect(() => {
      const activeItem = filteredItems[active];
      if (activeItem && !Separator.isSeparator(activeItem)) {
        const currentActiveValue = (activeItem as NormalizedChoice<Value>).value;
        if (activeItemValue !== currentActiveValue) {
          setActiveItemValue(currentActiveValue);
        }
      }
    }, [active, filteredItems, activeItemValue]);

    const [errorMsg, setError] = useState<string>();

    useEffect(() => {
      if (process.stdout.isTTY) {
        process.stdout.write(ansiEscapes.cursorHide);
      }

      return () => {
        if (process.stdout.isTTY) {
          process.stdout.write(ansiEscapes.cursorShow);
        }
      };
    }, []);

    useEffect(() => {
      if (!config.source) {
        return;
      }

      const controller = new AbortController();

      setStatus('loading');
      setSearchError(undefined);

      const result = config.source(searchTerm || undefined, {
        signal: controller.signal,
      });

      Promise.resolve(result)
        .then((choices: readonly (string | Separator | Choice<Value>)[]) => {
          if (controller.signal.aborted) return;

          const normalizedChoices = normalizeChoices<Value>(
            choices as ReadonlyArray<Choice<Value> | Separator>
          );
          setAllItems(normalizedChoices);
          setStatus('idle');
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error('Source function error:', error);
          setSearchError(error instanceof Error ? error.message : 'Failed to load choices');
          setStatus('idle');
        });

      return () => {
        controller.abort();
      };
    }, [config.source, searchTerm]);

    useEffect(() => {
      allItemsRef.current = allItems;
    }, [allItems]);

    useKeypress((key, rl) => {
      const updateSearchTerm = (newTerm: string) => {
        rl.clearLine(0);
        rl.write(newTerm);
        setSearchTerm(newTerm);
      };
      const isNavigationOrAction =
        key.name === 'up' ||
        key.name === 'down' ||
        key.name === 'tab' ||
        key.name === 'enter' ||
        key.name === 'escape';

      if (status !== 'idle' && isNavigationOrAction) {
        return;
      }

      setError(undefined);

      if (key.name === 'escape') {
        updateSearchTerm('');
        return;
      }

      if (key.name === 'up' || key.name === 'down') {
        rl.clearLine(0);

        const direction = key.name === 'up' ? -1 : 1;
        const selectableIndexes = filteredItems
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => isSelectable(item))
          .map(({ index }) => index);

        if (selectableIndexes.length === 0) return;

        const currentSelectableIndex = selectableIndexes.findIndex((index) => index >= active);
        let nextSelectableIndex = currentSelectableIndex + direction;

        if (loop) {
          if (nextSelectableIndex < 0) nextSelectableIndex = selectableIndexes.length - 1;
          if (nextSelectableIndex >= selectableIndexes.length) nextSelectableIndex = 0;
        } else {
          nextSelectableIndex = Math.max(
            0,
            Math.min(nextSelectableIndex, selectableIndexes.length - 1)
          );
        }

        const nextFilteredIndex = selectableIndexes[nextSelectableIndex];
        const nextSelectableItem = filteredItems[nextFilteredIndex];
        if (nextSelectableItem && isSelectable(nextSelectableItem)) {
          setActiveItemValue(nextSelectableItem.value);
        }

        return;
      }

      if (key.name === 'tab' || key.name === 'space') {
        const preservedSearchTerm = searchTerm;

        const activeItem = filteredItems[active];
        if (activeItem && isSelectable(activeItem)) {
          const activeValue = (activeItem as NormalizedChoice<Value>).value;

          setActiveItemValue(activeValue);

          setAllItems(
            allItems.map((item) => {
              if (!Separator.isSeparator(item) && item.value === activeValue) {
                const toggled = toggle(item);
                return toggled;
              }
              return item;
            })
          );
        }

        updateSearchTerm(preservedSearchTerm);

        return;
      }

      if (isEnterKey(key)) {
        const selectedChoices = allItems.filter(isChecked);

        if (required && selectedChoices.length === 0) {
          setError('At least one choice must be selected');
          return;
        }

        const result = validate(selectedChoices);

        if (typeof result === 'string') {
          setError(result);
          return;
        }

        if (result === false) {
          setError('Invalid selection');
          return;
        }

        if (typeof result === 'object' && 'then' in result) {
          result
            .then((isValid) => {
              if (typeof isValid === 'string') {
                setError(isValid);
              } else if (isValid === false) {
                setError('Invalid selection');
              } else {
                setStatus('done');
                done(selectedChoices.map((choice) => choice.value));
              }
            })
            .catch(() => {
              setError('Validation failed');
            });
          return;
        }

        setStatus('done');
        done(selectedChoices.map((choice) => choice.value));
        return;
      }

      if (!isNavigationOrAction) {
        setSearchTerm(rl.line);
      }
    });

    const activeDescription = useMemo(() => {
      const activeItem = filteredItems[active];
      if (activeItem && !Separator.isSeparator(activeItem)) {
        return (activeItem as NormalizedChoice<Value>).description;
      }
      return undefined;
    }, [active, filteredItems]);

    const resolveIcon = (icon: string | ((text: string) => string), choiceText: string): string => {
      return typeof icon === 'function' ? icon(choiceText) : icon;
    };

    const renderItem = useMemo(() => {
      return ({ item, isActive }: { item: Item<Value>; isActive: boolean }) => {
        const line: string[] = [];

        if (Separator.isSeparator(item)) {
          return colors.dim(item.separator);
        }

        const isChecked = !Separator.isSeparator(item) && (item as NormalizedChoice<Value>).checked;

        const choiceName = (item as NormalizedChoice<Value>).name;
        const checkbox = resolveIcon(
          isChecked ? theme.icon.checked : theme.icon.unchecked,
          choiceName
        );
        const cursor = isActive
          ? resolveIcon(theme.icon.cursor, choiceName)
          : resolveIcon(theme.icon.nocursor ?? ' ', choiceName);

        line.push(cursor, checkbox);

        let text = (item as NormalizedChoice<Value>).name;
        if (isActive) {
          text = theme.style.highlight(text);
        } else if ((item as NormalizedChoice<Value>).disabled) {
          text = theme.style.disabled(text);
        } else if (isChecked) {
          text = theme.style.checked(text);
        }

        line.push(text);

        if ((item as NormalizedChoice<Value>).disabled) {
          const disabledReason =
            typeof (item as NormalizedChoice<Value>).disabled === 'string'
              ? ((item as NormalizedChoice<Value>).disabled as string)
              : 'disabled';
          line.push(theme.style.disabled(`(${disabledReason})`));
        }

        return line.join(' ');
      };
    }, [theme, config.theme]);

    const page = usePagination<Item<Value>>({
      items: filteredItems,
      active,
      renderItem,
      pageSize,
      loop,
    });

    const message = theme.style.message(config.message, status);
    let helpTip = '';

    if (theme.helpMode === 'always' && config.instructions !== false) {
      if (typeof config.instructions === 'string') {
        helpTip = `\n${theme.style.help(`(${config.instructions})`)}`;
      } else {
        const tips: string[] = ['Space/Tab to select', 'Enter to submit'];
        helpTip = `\n${theme.style.help(`(${tips.join(', ')})`)}`;
      }
    }

    let searchLine = '';
    if (config.source || config.choices || searchTerm || status === 'loading') {
      const searchPrefix = status === 'loading' ? 'Loading...' : 'Search:';
      const styledTerm = searchTerm ? theme.style.searchTerm(searchTerm) : '';
      searchLine = `\n${searchPrefix} ${styledTerm}`;
    }

    let errorLine = '';
    if (errorMsg) {
      errorLine = `\n${theme.style.error(errorMsg)}`;
    }

    if (searchError) {
      errorLine = `\n${theme.style.error(`Error: ${searchError}`)}`;
    }

    let content = '';
    if (status === 'loading') {
      content = '\nLoading choices...';
    } else if (filteredItems.length === 0) {
      content = '\nNo choices available';
    } else {
      content = `\n${page}`;
    }

    let descriptionLine = '';
    if (activeDescription) {
      descriptionLine = `\n${theme.style.description(activeDescription)}`;
    }

    return `${prefix} ${message}${helpTip}${searchLine}${errorLine}${content}${descriptionLine}`;
  }
);

export { Separator };
export default checkboxSearch;
