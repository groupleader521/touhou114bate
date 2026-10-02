"""Technical alpha-preserving resize/DDS conversion of the generated module artwork."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'gfx/interface/equipmentdesigner/touhou_modules'
DOC = ROOT / 'docs/module_icon_art'
SIZE = (56, 42)


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--partial', action='store_true')
    parser.add_argument('--optional', action='store_true', help='Convert the new optional artwork without rewriting the original 55 textures')
    args = parser.parse_args()
    prefix = 'optional_' if args.optional else ''
    plan = json.loads((DOC / (prefix + 'generation_plan.json')).read_text(encoding='utf-8'))
    records = []
    (ART / 'icons').mkdir(parents=True, exist_ok=True)
    (DOC / 'preview').mkdir(parents=True, exist_ok=True)
    for item in plan:
        source = ART / 'source' / (item['id'] + '.png')
        if not source.exists():
            if args.partial:
                continue
            raise ValueError('Missing generated artwork: ' + item['id'])
        image = Image.open(source).convert('RGBA')
        alpha = image.getchannel('A')
        if alpha.getextrema() != (0, 255):
            raise ValueError('Artwork needs a transparent background and solid object: ' + item['id'])
        bounds = alpha.point(lambda a: 255 if a >= 8 else 0).getbbox()
        if not bounds:
            raise ValueError('Empty artwork: ' + item['id'])
        # Remove unused transparent margins, retain the original generated alpha/glow.
        bounds = (max(0, bounds[0]-6), max(0, bounds[1]-6),
                  min(image.width, bounds[2]+6), min(image.height, bounds[3]+6))
        cutout = image.crop(bounds)
        cutout.thumbnail((52, 38), Image.Resampling.LANCZOS)
        icon = Image.new('RGBA', SIZE)
        icon.alpha_composite(cutout, ((SIZE[0]-cutout.width)//2, (SIZE[1]-cutout.height)//2))
        target = ART / 'icons' / (item['id'] + '.dds')
        icon.save(target, pixel_format=None)
        preview = DOC / 'preview' / (item['id'] + '.png')
        icon.save(preview)
        decoded = Image.open(target).convert('RGBA')
        if decoded.size != SIZE or decoded.tobytes() != icon.tobytes():
            raise ValueError('DDS round trip changed pixels: ' + item['id'])
        records.append(dict(id=item['id'], name=item['name'], style=item.get('style'), source=source.relative_to(ROOT).as_posix(),
                            texture=target.relative_to(ROOT).as_posix(), sourceSize=image.size,
                            size=SIZE, sourceSha256=digest(source), textureSha256=digest(target)))
    (DOC / (prefix + 'conversion_metadata.json')).write_text(json.dumps(records, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 16)
    smallfont = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 12)
    groups = [(kind, style) for kind in ('tank', 'air') for style in ('magic', 'wakan', 'demonforce')] if args.optional else [(kind, None) for kind in ('tank', 'air')]
    for kind, style in groups:
        rows = [r for r in records if r['id'].startswith(kind + '_') and (style is None or r['style'] == style)]
        if not rows:
            continue
        columns, cellw, cellh = 4, 230, 175
        sheet = Image.new('RGB', (columns*cellw, ((len(rows)+columns-1)//columns)*cellh+45), '#292b2d')
        draw = ImageDraw.Draw(sheet)
        style_name = {'magic':'魔力', 'wakan':'灵力', 'demonforce':'妖力'}.get(style, '')
        draw.text((12, 10), style_name+('坦克配件' if kind == 'tank' else '飞机配件')+' — 3倍预览及实际尺寸', font=font, fill='#ece5d9')
        for i, row in enumerate(rows):
            x, y = (i % columns)*cellw, (i//columns)*cellh+45
            icon = Image.open(DOC / 'preview' / (row['id']+'.png'))
            sheet.paste(icon.resize((168,126), Image.Resampling.NEAREST), (x+30,y), icon.resize((168,126), Image.Resampling.NEAREST))
            sheet.paste(icon, (x+5,y+125), icon)
            draw.text((x+65,y+132), row['name'], font=smallfont, fill='#ece5d9')
            label = row['id'].split('_', 3)[-1] if args.optional else row['id']
            draw.text((x+6,y+156), label, font=smallfont, fill='#b5b5b5')
        sheet.save(DOC / (prefix+kind+('_'+style if style else '')+'_icons_preview.png'))
    if args.optional:
        picks = [
            ['tank_optional_magic_crew_comfort', 'tank_optional_magic_ornamental_armor',
             'tank_optional_magic_secondary_lance', 'air_optional_magic_aux_camera'],
            ['tank_optional_wakan_radio_1', 'tank_optional_wakan_ornamental_armor',
             'air_optional_wakan_aux_cannon', 'air_optional_wakan_maritime_eye'],
            ['tank_optional_demonforce_ornamental_armor', 'tank_optional_demonforce_dozer',
             'air_optional_demonforce_aux_heavy', 'air_optional_demonforce_tail_sentry']
        ]
        titles = ['魔力 · 人偶与魔晶', '灵力 · 御札与结界', '妖力 · 骨角与活体']
        by_id = {row['id']:row for row in records}
        overview = Image.new('RGB', (810, 755), '#292b2d')
        draw = ImageDraw.Draw(overview)
        for col, ids in enumerate(picks):
            draw.text((col*270+12, 12), titles[col], font=font, fill='#ece5d9')
            for line, asset_id in enumerate(ids):
                if asset_id not in by_id:
                    continue
                row = by_id[asset_id]
                icon = Image.open(DOC / 'preview' / (asset_id+'.png'))
                big = icon.resize((168,126), Image.Resampling.NEAREST)
                x, y = col*270, line*175+50
                overview.paste(big, (x+45,y), big)
                overview.paste(icon, (x+8,y+127), icon)
                draw.text((x+68,y+137), row['name'], font=smallfont, fill='#ece5d9')
        overview.save(DOC / 'optional_overview.png')
    print(json.dumps(dict(converted=len(records), expected=len(plan), dimensions=SIZE)))


if __name__ == '__main__':
    main()
