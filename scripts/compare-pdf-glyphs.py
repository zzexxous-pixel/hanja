# Optional audit utility; never runs as part of the web app or deployment.
# python -m pip install pymupdf Pillow; python scripts/compare-pdf-glyphs.py INPUT_DIR --output _audit/pdf-comparison
# Matching is automated; structural shape review of the output images remains manual.
import argparse, subprocess
import pymupdf as f, json, glob, unicodedata as u, hashlib, os
from PIL import Image,ImageDraw,ImageFont
parser=argparse.ArgumentParser(description='Render actual PDF glyphs beside selected app outlines; no review flags changed.')
parser.add_argument('input_dir');parser.add_argument('--output',default='_audit/pdf-comparison')
args=parser.parse_args();root=args.output
os.makedirs(root+'/svg',exist_ok=True)
subprocess.run(['node','--input-type=module','-e',r"""
import fs from 'node:fs';import {characters,selectData,glyphSvg,codePoint} from './scripts/strokes.mjs';
const root=process.argv[1],items=characters('.'),m=JSON.parse(fs.readFileSync('data/stroke-overrides/manifest.json'));
fs.writeFileSync(root+'/items.json',JSON.stringify(items));
for(const item of items)fs.writeFileSync(root+'/svg/'+codePoint(item.h)+'.svg',glyphSvg(selectData('.',item,m).data));
""",root],check=True)
items=json.load(open(root+'/items.json')); norm=lambda s:u.normalize('NFKC',s)
try: font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
except OSError: font=ImageFont.load_default()
rows=[];sources=[]
for name in sorted(glob.glob(os.path.join(args.input_dir,'*.pdf'))):
 grade=os.path.basename(name).split(' ')[0]; doc=f.open(name); glyphs=[]
 for pi,page in enumerate(doc):
  for b in page.get_text('rawdict')['blocks']:
   for l in b.get('lines',[]):
    for s in l['spans']:
     if s['size']>13:continue
     for c in s['chars']:
      if '\u3400'<=c['c']<='\u9fff' or '\uf900'<=c['c']<='\ufaff':glyphs.append(dict(char=c['c'],bbox=c['bbox'],page=pi,font=s['font']))
  page.add_redact_annot(page.rect,fill=False);page.apply_redactions(images=2,graphics=2,text=1)
 expected=[x for x in items if x['grade']==grade];found=[]
 for item in expected:
  hits=[x for x in glyphs if norm(x['char'])==norm(item['h'])]
  rows.append(dict(**item,matches=len(hits),pdfChar=hits[0]['char'] if hits else None))
  if len(hits)!=1:continue
  hit=hits[0];page=doc[hit['page']];pix=page.get_pixmap(matrix=f.Matrix(12,12),clip=f.Rect(hit['bbox']),alpha=False)
  left=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
  svg=f.open(root+'/svg/'+f"{ord(item['h']):04X}"+'.svg');p=f.open('pdf',svg.convert_to_pdf());pix=p[0].get_pixmap(matrix=f.Matrix(.2,.2),alpha=False)
  right=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
  found.append((item,hit,left,right))
 for batch in range(0,len(found),50):
  subset=found[batch:batch+50];img=Image.new('RGB',(1500,((len(subset)+4)//5)*170),'white');draw=ImageDraw.Draw(img)
  for i,(item,hit,left,right) in enumerate(subset):
   x=(i%5)*300;y=(i//5)*170
   draw.rectangle((x,y,x+299,y+169),outline='#cbd5e1');draw.text((x+8,y+5),f"{batch+i+1} U+{ord(item['h']):04X} PDF / APP",font=font,fill='black')
   for col,im in enumerate([left,right]):
    gray=im.convert('L');box=gray.point(lambda p:255 if p<200 else 0).getbbox()
    if box: im=im.crop(box)
    im.thumbnail((125,125));img.paste(im,(x+col*150+(150-im.width)//2,y+31+(130-im.height)//2))
  path=f'{root}/{grade}-{batch//50+1}.png';img.save(path)
 sources.append(dict(grade=grade,pages=len(doc),file=os.path.basename(name),sha256=hashlib.sha256(open(name,'rb').read()).hexdigest(),expected=len(expected),pdfGlyphs=len(glyphs),matched=len(found),unmatched=[x['char'] for x in glyphs if not any(norm(x['char'])==norm(i['h']) for i in expected)]))
json.dump(sources,open(root+'/sources.json','w'),ensure_ascii=False,indent=2)
json.dump(rows,open(root+'/results.json','w'),ensure_ascii=False,indent=2)
print(json.dumps(sources,ensure_ascii=False,indent=2));print('nonunique matches:',[x for x in rows if x['matches']!=1])

if not sources or any(r['matches']!=1 for r in rows) or any(s['unmatched'] for s in sources):
 raise SystemExit('No sources or unmatched/ambiguous glyphs; investigate before visual review.')
