const timeline = document.getElementById('timeline');
const categoryFilter = document.getElementById('category-filter');
const MEMPOOL_TX_BASE_URL = 'https://mempool.space/tx/';
const MEMPOOL_BLOCK_BASE_URL = 'https://mempool.space/block/';
const CATEGORY_ORDER = [
  'consensus',
  'consensus-maintenance',
  'activation',
  'policy',
  'fork-choice',
  'security',
  'incident',
  'fork',
  'release',
  'chain',
  'transaction',
  'governance',
  'development',
  'ecosystem',
  'market',
  'culture'
];

function formatBlock(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function getEraClass(block) {
  if (block === 0) return 'genesis';
  if (block <= 97218) return 'early';
  if (block <= 230009) return 'formative';
  if (block <= 481824) return 'scaling';
  return 'modern';
}

function parseEvents(text) {
  const events = [];
  let current = null;

  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eventLine = rawLine.match(/^\s*([\d ]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(.*)$/);
    if (eventLine) {
      current = {
        block: Number(eventLine[1].replace(/\s+/g, '')),
        category: eventLine[2].trim().toLowerCase(),
        label: eventLine[3].trim(),
        desc: eventLine[4].trim()
      };
      events.push(current);
      continue;
    }

    if (current) current.desc += `\n${trimmed}`;
  }

  return events
    .map((event) => ({ ...event, desc: event.desc.replace(/\\n/g, '\n') }))
    .filter((event) => Number.isFinite(event.block) && event.category && event.label && event.desc)
    .sort((a, b) => a.block - b.block);
}

function shortHash(value) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
}

function tidyText(value) {
  const normalized = value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();

  return normalized
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('; ');
}

function parseDescription(raw) {
  const links = [];
  let text = raw.replace(/\\n/g, '\n');

  text = text.replace(/\b((?:[A-Za-z][A-Za-z0-9 /_-]{0,32}\s+)?txid):\s*([0-9a-fA-F]{64})\b/gi, (_match, label, txid) => {
    const normalized = label.trim().toLowerCase();
    links.push({
      type: 'tx',
      label: normalized === 'coinbase txid' ? 'coinbase tx' : 'tx',
      url: `${MEMPOOL_TX_BASE_URL}${txid}`,
      value: shortHash(txid)
    });
    return '';
  });

  text = text.replace(/\b([A-Za-z][A-Za-z0-9 /_-]{0,32}):\s*(https?:\/\/[^\s;]+)/g, (_match, label, url) => {
    const cleanLabel = label.trim();
    const type = cleanLabel.toLowerCase().replace(/\s+/g, '-');
    const blockHeight = url.match(/^https:\/\/mempool\.space\/block-height\/(\d+)$/);
    const blockPage = url.match(/^https:\/\/mempool\.space\/block\/(\d+)$/);

    links.push({
      type,
      label: cleanLabel,
      url: blockHeight ? `${MEMPOOL_BLOCK_BASE_URL}${blockHeight[1]}` : url,
      value: blockHeight || blockPage ? `#${formatBlock(Number((blockHeight || blockPage)[1]))}` : cleanLabel
    });
    return '';
  });

  return { text: tidyText(text), links };
}

function spacingForDelta(delta) {
  if (delta <= 0) return 0;
  // Compressed block-distance spacing: 100 blocks stays close, 10k blocks is visibly far.
  return Math.min(180, Math.max(8, Math.sqrt(delta) * 0.9));
}

function prepareMilestones(events) {
  return events.map((event) => {
    const parsed = parseDescription(event.desc);
    return { ...event, parsed };
  });
}

function renderCategoryFilter(milestones, selectedCategories, isOpen, onToggle, onChange) {
  if (!categoryFilter) return;

  const categoryMap = new Map();
  for (const event of milestones) {
    if (!categoryMap.has(event.category)) categoryMap.set(event.category, event.category);
  }

  const categories = [...categoryMap]
    .sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
    });

  categoryFilter.textContent = '';
  categoryFilter.classList.toggle('is-open', isOpen);

  const selectedCount = selectedCategories.size;
  const totalCount = categories.length;
  const summary = selectedCount === totalCount
    ? 'All categories'
    : selectedCount === 0
      ? 'None selected'
      : `${selectedCount} of ${totalCount} categories`;

  const bar = document.createElement('div');
  bar.className = 'category-filter-bar';

  const title = document.createElement('span');
  title.className = 'category-filter-title';
  title.textContent = 'Categories';
  bar.appendChild(title);

  const toggle = document.createElement('button');
  toggle.className = 'category-filter-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.setAttribute('aria-controls', 'category-filter-panel');
  toggle.addEventListener('click', () => onToggle(!isOpen));

  const toggleText = document.createElement('span');
  toggleText.className = 'category-filter-summary';
  toggleText.textContent = summary;

  const caret = document.createElement('span');
  caret.className = 'category-filter-caret';
  caret.textContent = '▾';

  toggle.appendChild(toggleText);
  toggle.appendChild(caret);
  bar.appendChild(toggle);
  categoryFilter.appendChild(bar);

  const panel = document.createElement('div');
  panel.className = 'category-filter-panel';
  panel.id = 'category-filter-panel';
  panel.hidden = !isOpen;

  const actions = document.createElement('div');
  actions.className = 'category-filter-actions';

  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.textContent = 'Select all';
  allButton.disabled = selectedCount === totalCount;
  allButton.addEventListener('click', () => onChange(new Set(categories.map(([id]) => id))));

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear';
  clearButton.disabled = selectedCount === 0;
  clearButton.addEventListener('click', () => onChange(new Set()));

  actions.appendChild(allButton);
  actions.appendChild(clearButton);
  panel.appendChild(actions);

  const options = document.createElement('div');
  options.className = 'category-filter-options';

  for (const [id, label] of categories) {
    const chip = document.createElement('label');
    chip.className = `filter-chip type-${id} ${selectedCategories.has(id) ? 'is-active' : ''}`;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.category = id;
    input.checked = selectedCategories.has(id);
    input.addEventListener('change', () => {
      const next = new Set(selectedCategories);
      if (input.checked) next.add(id);
      else next.delete(id);
      onChange(next, id);
    });

    const text = document.createElement('span');
    text.textContent = label;

    chip.appendChild(input);
    chip.appendChild(text);
    options.appendChild(chip);
  }

  panel.appendChild(options);
  categoryFilter.appendChild(panel);
}

function renderTimeline(milestones) {
  timeline.textContent = '';

  if (milestones.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'timeline-empty';
    empty.textContent = 'No categories selected.';
    timeline.appendChild(empty);
    return;
  }

  for (const [index, m] of milestones.entries()) {
    const previous = milestones[index - 1];
    const delta = previous ? m.block - previous.block : 0;
    const el = document.createElement('div');
    const parsed = m.parsed;
    el.className = `item ${getEraClass(m.block)} type-${m.category}`;
    el.style.setProperty('--i', index);
    el.style.setProperty('--gap', `${spacingForDelta(delta)}px`);

    const node = document.createElement('span');
    node.className = 'item-node';

    const content = document.createElement('div');
    content.className = 'item-content';

    const head = document.createElement('div');
    head.className = 'item-head';

    const block = document.createElement('span');
    block.className = 'item-block';
    block.textContent = formatBlock(m.block);

    const type = document.createElement('span');
    type.className = 'item-type';
    type.textContent = m.category;

    const label = document.createElement('h2');
    label.className = 'item-label';
    label.textContent = m.label;

    const desc = document.createElement('div');
    desc.className = 'item-desc';
    const descText = document.createElement('p');
    descText.textContent = parsed.text;
    desc.appendChild(descText);

    if (parsed.links.length > 0) {
      const links = document.createElement('div');
      links.className = 'item-links';
      for (const link of parsed.links) {
        const a = document.createElement('a');
        a.className = `event-link event-link-${link.type}`;
        a.href = link.url;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.title = link.url;

        const kind = document.createElement('span');
        kind.className = 'event-link-kind';
        kind.textContent = link.label;

        const value = document.createElement('span');
        value.className = 'event-link-value';
        value.textContent = link.value === link.label ? 'open' : link.value;

        a.appendChild(kind);
        a.appendChild(value);
        links.appendChild(a);
      }
      desc.appendChild(links);
    }

    head.appendChild(block);
    head.appendChild(type);
    head.appendChild(label);
    content.appendChild(head);
    content.appendChild(desc);

    el.appendChild(node);
    el.appendChild(content);

    timeline.appendChild(el);
  }
}

fetch('events.txt')
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load events.txt: ${response.status}`);
    return response.text();
  })
  .then((text) => {
    const milestones = prepareMilestones(parseEvents(text));
    let selectedCategories = new Set(milestones.map((event) => event.category));
    let categoryMenuOpen = false;
    let focusedCategory = null;

    const render = () => {
      renderCategoryFilter(
        milestones,
        selectedCategories,
        categoryMenuOpen,
        (nextOpen) => {
          categoryMenuOpen = nextOpen;
          render();
        },
        (nextSelectedCategories, nextFocusedCategory) => {
          selectedCategories = nextSelectedCategories;
          categoryMenuOpen = true;
          focusedCategory = nextFocusedCategory;
          render();
        }
      );
      renderTimeline(milestones.filter((event) => selectedCategories.has(event.category)));

      if (focusedCategory && categoryFilter) {
        for (const input of categoryFilter.querySelectorAll('input[data-category]')) {
          if (input.dataset.category === focusedCategory) {
            input.focus();
            break;
          }
        }
        focusedCategory = null;
      }
    };

    render();
  })
  .catch(() => {
    timeline.textContent = 'Could not load events.txt. Start a local server and refresh.';
  });
