"""One-off migration: move every hard-coded border-radius in css/*.css onto the shape tokens (css/base.css :root).
Each rule is classified by its selector (what the element is), then given a role token; anything unclassified gets
the nearest scale token. Squircle roles also get `corner-shape: var(--shape-curve)`.
Left alone on purpose: 0, inherit, 1–3 px hairlines, calc()/clamp() illustration maths, and the token block itself.
Run from the repo root: python dev/migrate-shapes.py   (prints a report; rerunning changes nothing)"""
import pathlib, re, collections

CSS = sorted(pathlib.Path('css').glob('*.css'))
SQUIRCLE_ROLES = {'card', 'tile', 'icon', 'modal', 'sheet'}

# what an element is, from its selector (first match wins)
ROLES = [
    ('circle', r'\bava\b|avatar|__ava|knob|__dot|\bdot\b|spin\b|marker|\bmk\b|mk__|you-dot|pulse|ring|radio'),
    ('chip', r'chip|\btag\b|tag--|badge|pill|status|__count|count\b|legend|switch|toggle|\bseg\b|seg__|filter|tfilter|dlive|eta|notch|bubble|label\b|__label|kicker|\bkbd\b|tab__ongoing|tab__count|stars|crumb|step'),
    ('sheet', r'\bsheet\b|sheet--|bottom-sheet|\.ride \.panel|asheet|\.wallet\b|cart-panel'),
    ('modal', r'dialog|modal|popover|menu\b|dropdown|\.panel\b|lightbox|overlay|tooltip|__tip\b'),
    ('input', r'input|field|search|select|textarea|pickup__|place|combobox|editor'),
    ('button', r'\bbutton\b|button--|\.btn\b|btn-|\bbtn\b|__btn|\bcta\b|\baccept\b|__accept|install|sos911|dpay__btn|dlink|signin__|\baction|__go\b|__more|map__|locate|\bfab\b'),
    ('icon', r'__ic\b|__icon|icon\b|__art|\bart\b|thumb|__pic|\bpic\b|photo|logo|__img|\bimg\b|emoji|\bbrand\b'),
    ('row', r'\brow\b|row--|__row|\btrow\b|drow|list|table|\bth\b|\btd\b|toast|banner|note|pager|tpages|item\b'),
    ('card', r'card|tile|\bsvc\b|svc--|promo|wcard|wsec|dstatus|hero|cempty|activejob|\.rq\b|dongoing|dempty|dsum|dweek|dglance|dpay|dtrips|dacct|choice|\bbox\b|__box|receipt|summary|\bstat\b|stats|kpi|chart|order|shop|menu-item|panel|section|sgrid|dock|egrid|cargo|offer|quick|pick|finder|mood|maccept|\.route\b|vehicle|ticket|suggest|omap'),
]

def scale(px):
    if px <= 3: return None
    if px <= 7: return 'var(--shape-2xs)'
    if px <= 10: return 'var(--shape-xs)'
    if px <= 13: return 'var(--shape-sm)'
    if px <= 17: return 'var(--shape-md)'
    if px <= 24: return 'var(--shape-lg)'
    if px <= 31: return 'var(--shape-xl)'
    if px < 99: return 'var(--shape-2xl)'
    return 'var(--shape-pill)'

ROLE_TOKEN = {'card': 'var(--shape-card)', 'tile': 'var(--shape-tile)', 'icon': 'var(--shape-icon)', 'modal': 'var(--shape-modal)',
              'sheet': 'var(--shape-sheet)', 'button': 'var(--shape-button)', 'input': 'var(--shape-input)', 'row': 'var(--shape-row)', 'chip': 'var(--shape-chip)'}

def role_of(selector):
    s = re.sub(r'/\*.*?\*/', '', selector, flags=re.S).split('*/')[-1].lower()  # comments must not steer the role
    for role, rx in ROLES:
        if re.search(rx, s): return role
    return None

def convert(selector, value, stats):
    v = value.strip()
    if 'var(' in v or 'calc(' in v or 'clamp(' in v or v in ('0', 'inherit', 'initial', 'unset') or '/' in v:
        stats['left'] += 1; return None, None
    parts = v.split()
    if not all(re.fullmatch(r'\d+(\.\d+)?(px|%)|0', p) for p in parts):
        stats['left'] += 1; return None, None
    role = role_of(selector)
    # one value
    if len(parts) == 1:
        p = parts[0]
        if p.endswith('%'):
            if p == '50%':
                stats['circle'] += 1
                return ('var(--shape-pill)' if role == 'chip' else 'var(--shape-circle)'), None
            stats['left'] += 1; return None, None
        px = float(p[:-2])
        if px <= 3: stats['left'] += 1; return None, None
        if role == 'circle' and 8 <= px < 99 and 'ava' in selector.lower():  # a rounded-square avatar is a logo or picture: identity, so a squircle
            stats['icon'] += 1; return (ROLE_TOKEN['icon'] if px < 16 else ROLE_TOKEN['tile']), 'curve'
        if px >= 99:  # a pill: chips stay pills; a button becomes a rounded rectangle; a circle-ish small thing stays a pill
            if role == 'button' and not re.search(r'btn-soft|hot-btn', selector): stats['button'] += 1; return ROLE_TOKEN['button'], None  # those two are compact actions: pills
            stats['chip'] += 1; return ROLE_TOKEN['chip'], None
        if role in ('card', 'modal') and px >= 16:
            stats[role] += 1; return ROLE_TOKEN[role], 'curve'
        if role == 'card' and px < 16:
            stats['tile'] += 1; return ROLE_TOKEN['tile'], 'curve'
        if role == 'sheet':
            stats['sheet'] += 1; return ROLE_TOKEN['sheet'], 'curve'
        if role == 'icon' and px >= 8:
            stats['icon'] += 1; return (ROLE_TOKEN['icon'] if px < 16 else ROLE_TOKEN['tile']), 'curve'
        if role in ('button', 'input') and px >= 8:
            stats[role] += 1; return ROLE_TOKEN[role], None
        if role == 'row' and 8 <= px <= 17:
            stats['row'] += 1; return ROLE_TOKEN['row'], None
        stats['scale'] += 1; return scale(px), None
    # several values (top corners of a sheet, a speech bubble): each to the scale, sheets to the sheet token
    out = []
    for p in parts:
        if p == '0' or p == '0px': out.append('0'); continue
        if p.endswith('%'): out.append(p); continue
        px = float(p[:-2])
        if role == 'sheet' and px >= 16: out.append(ROLE_TOKEN['sheet']); continue
        out.append(scale(px) or p)
    stats['multi'] += 1
    return ' '.join(out), ('curve' if role in SQUIRCLE_ROLES or role == 'sheet' else None)

def migrate(text, stats, leftovers, fname):
    def rule(m):
        selector, body = m.group(1), m.group(2)
        if ':root' in selector: return m.group(0)  # the tokens themselves
        def decl(d):
            new, curve = convert(selector, d.group(1), stats)
            if new is None:
                leftovers.append(f'{fname}: {selector.strip()[:60]} → {d.group(1).strip()}')
                return d.group(0)
            return f'border-radius: {new}' + ('; corner-shape: var(--shape-curve)' if curve and 'corner-shape' not in body else '')
        return selector + '{' + re.sub(r'border-radius:\s*([^;}]+?)(?=\s*[;}])', decl, body) + '}'
    return re.sub(r'([^{}]+)\{([^{}]*)\}', rule, text)

stats = collections.Counter(); leftovers = []
for f in CSS:
    t = f.read_text(encoding='utf-8')
    n = migrate(t, stats, leftovers, f.name)
    if n != t: f.write_text(n, encoding='utf-8')
print('migrated by role:', dict(stats))
print(f'left as is ({len(leftovers)}):')
for l in leftovers: print('  ', l)
