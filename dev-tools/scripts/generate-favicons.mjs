import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { format, resolveConfig } from 'prettier';

const pixelStudy = process.argv.includes('--thermal-pixels');
const output = new URL(
  pixelStudy
    ? '../../output/favicon-studies/thermal-pixels/'
    : '../../output/favicon-studies/',
  import.meta.url
);
const formatOptions = await resolveConfig(fileURLToPath(import.meta.url));
await mkdir(output, { recursive: true });

// A geometric reduction of the existing R: an open counter and a heavy leg
// retain the letter at 16 px. Every colourway uses the same master outline.
const letter =
  'M12 10H34C48 10 54 16 54 27C54 35 50 40 43 42L56 56H40L29 38H25V56H12Z M25 21V31H34C39 31 41 30 41 26C41 22 38 21 34 21Z';
const path = (fill, extra = '') =>
  `<path d="${letter}" fill="${fill}" fill-rule="evenodd" ${extra}/>`;
const svg = (name, drawing) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><title>${name}</title>${drawing}</svg>`;
const ground = '<rect width="64" height="64" rx="12" fill="#151516"/>';

function fusionRing(radius, amplitude, phase = 0) {
  return (
    Array.from({ length: 180 }, (_, i) => {
      const a = (i / 180) * Math.PI * 2;
      const r = radius + amplitude * Math.cos(3 * a + phase);
      return `${i ? 'L' : 'M'}${(32 + r * Math.cos(a)).toFixed(3)} ${(32 + r * Math.sin(a)).toFixed(3)}`;
    }).join(' ') + 'Z'
  );
}

function voxelLetter() {
  const cells = ['11110', '10001', '10001', '11110', '10100', '10010', '10001'];
  let sides = '',
    faces = '';
  cells.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell !== '1') return;
      const px = 13 + x * 6,
        py = 8 + y * 6;
      if (row[x + 1] !== '1')
        sides += `<path d="M${px + 6} ${py}l7 6v6l-7 -6Z" fill="#7952ed"/>`;
      if (cells[y + 1]?.[x] !== '1')
        sides += `<path d="M${px} ${py + 6}l7 6h6l-7 -6Z" fill="#4931aa"/>`;
      faces += `<path d="M${px} ${py}h6v6h-6Z"/>`;
    });
  });
  return `${sides}<g fill="#ddd4ff">${faces}</g>`;
}

let concepts = [
  {
    slug: 'cut-r',
    name: 'Cut R',
    tag: 'Recommended',
    note: 'A signal-orange shell, sliced open to expose the pale lower form. A compact identity for the current site.',
    svg: svg(
      'Cut R',
      `${ground}<defs><mask id="cut"><rect width="64" height="64" fill="white"/><path d="M8 37L58 28V32L8 41Z" fill="black"/></mask><clipPath id="upper"><path d="M0 0H64V27L0 39Z"/></clipPath></defs><g mask="url(#cut)">${path('#f4f1e8')}${path('#ff3600', 'clip-path="url(#upper)"')}</g>`
    ),
  },
  {
    slug: 'fusion',
    name: 'Fusion',
    tag: 'Living console',
    note: 'A threefold radial field becomes a luminous, hollow object. Console energy with a silhouette that survives reduction.',
    svg: svg(
      'Fusion',
      `${ground}<defs><linearGradient id="energy" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f3ffb5"/><stop offset=".38" stop-color="#c3ff44"/><stop offset=".7" stop-color="#80e51d"/><stop offset="1" stop-color="#23895b"/></linearGradient></defs><path d="${fusionRing(22, 4, -0.7)} ${fusionRing(8.5, 1.8, 0.8)}" fill="url(#energy)" fill-rule="evenodd"/><path d="${fusionRing(20.6, 3.7, -0.7)}" fill="none" stroke="#eaffac" stroke-width=".65" opacity=".5"/>`
    ),
  },
  {
    slug: 'voxel-r',
    name: 'Voxel R',
    tag: 'Pixels into objects',
    note: 'A seven-row letter extruded into a small arcade object. Pale faces, violet sides and a clear stepped outline.',
    svg: svg('Voxel R', `${ground}${voxelLetter()}`),
  },
  {
    slug: 'thermal-r',
    name: 'Thermal R',
    tag: 'Heat / contour',
    note: 'The same monogram becomes a thermal specimen. Nested heat bands resolve into one bold letter in a browser tab.',
    svg: svg(
      'Thermal R',
      `${ground}<defs><clipPath id="letter">${path('white')}</clipPath></defs><g clip-path="url(#letter)"><rect width="64" height="64" fill="#492de0"/>${[
        [43, '#9441ef'],
        [36, '#ed36aa'],
        [29, '#ff4251'],
        [22, '#ff822e'],
        [15, '#ffc747'],
        [8, '#fff1a8'],
      ]
        .map(
          ([r, color]) =>
            `<ellipse cx="32" cy="16" rx="${r}" ry="${r * 1.06}" fill="${color}"/>`
        )
        .join('')}</g>`
    ),
  },
];

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  if (pixelStudy) {
    const original = concepts.find((concept) => concept.slug === 'thermal-r');
    concepts = [{ ...original, tag: 'Original / saved' }];
    const variations = [
      {
        slug: 'pixel-heat-r',
        name: 'Pixel Heat R',
        tag: 'Recommended / 16-cell grid',
        step: 4,
        note: 'Thermal R’s exact smooth outline, filled with square heat-map cells. The letter stays intact; only its colour field is pixelated.',
      },
      {
        slug: 'fine-heat-r',
        name: 'Fine Heat R',
        tag: 'Dense / 32-cell grid',
        step: 2,
        note: 'The same smooth letter with a denser pixel heat map. The smallest exports use the coarse fill for clarity.',
      },
      {
        slug: 'spectrum-r',
        name: 'Spectrum R',
        tag: 'Infrared / 16-cell grid',
        step: 4,
        note: 'A cooler sensor palette: blue and cyan fall away from a white-hot orange core. A more pronounced heat-map reading.',
      },
    ];
    for (const variation of variations) {
      const makeCells = async (step) =>
        page.evaluate(
          ({ letter, step, spectral }) => {
            const colors = spectral
              ? [
                  '#5350ed',
                  '#3974f5',
                  '#279fe8',
                  '#40c9cf',
                  '#85ded1',
                  '#f7d864',
                  '#ffa044',
                  '#ff653e',
                  '#ffad66',
                  '#fff0bb',
                ]
              : [
                  '#6540ea',
                  '#8844ed',
                  '#b842dd',
                  '#dd3bbb',
                  '#f53b8e',
                  '#ff4b62',
                  '#ff7240',
                  '#ff9c36',
                  '#ffcc54',
                  '#fff0ae',
                ];
            let drawing = '';
            for (let y = 8; y < 56; y += step) {
              for (let x = 12; x < 56; x += step) {
                const cx = x + step / 2,
                  cy = y + step / 2;
                // A coherent illustrative field, quantised in position and colour.
                // Local waves perturb its contours without turning it into random noise.
                const distance = Math.hypot((cx - 30) * 1.08, (cy - 15) * 0.92);
                const heat =
                  1 -
                  distance / 48 +
                  0.045 * Math.sin(cx * 0.43 + cy * 0.19) * Math.cos(cy * 0.38);
                const color =
                  colors[
                    Math.max(
                      0,
                      Math.min(
                        colors.length - 1,
                        Math.floor(heat * colors.length)
                      )
                    )
                  ];
                drawing += `<rect x="${x}" y="${y}" width="${step}" height="${step}" fill="${color}"/>`;
              }
            }
            // Clip the full cell field with the unchanged master path. Sampling
            // cell centres for inclusion would also pixelate the silhouette.
            return `<defs><clipPath id="thermal-outline"><path d="${letter}" clip-rule="evenodd"/></clipPath></defs><g clip-path="url(#thermal-outline)"><g shape-rendering="crispEdges">${drawing}</g></g>`;
          },
          { letter, step, spectral: variation.slug === 'spectrum-r' }
        );
      concepts.push({
        ...variation,
        svg: svg(variation.name, ground + (await makeCells(variation.step))),
        smallSvg: svg(variation.name, ground + (await makeCells(4))),
      });
    }
  }
  for (const concept of concepts) {
    const directory = new URL(`${concept.slug}/`, output);
    await mkdir(directory, { recursive: true });
    await writeFile(
      new URL('favicon.svg', directory),
      await format(concept.svg, { ...formatOptions, parser: 'html' })
    );
    const pngs = new Map();
    for (const size of [16, 32, 48, 64, 180, 192, 512]) {
      const encoded = await page.evaluate(
        async ({ source, size }) => {
          const img = new Image();
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          canvas.getContext('2d').drawImage(img, 0, 0, size, size);
          return canvas.toDataURL('image/png').split(',')[1];
        },
        {
          source: size <= 32 ? concept.smallSvg || concept.svg : concept.svg,
          size,
        }
      );
      const png = Buffer.from(encoded, 'base64');
      pngs.set(size, png);
      await writeFile(new URL(`favicon-${size}.png`, directory), png);
    }
    // ICO supports PNG payloads. Include native 16/32/48 images so browsers
    // need not resample a large image to their tab size.
    const sizes = [16, 32, 48];
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, index) => {
      const entry = 6 + index * 16,
        png = pngs.get(size);
      header[entry] = header[entry + 1] = size;
      header.writeUInt16LE(1, entry + 4);
      header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(png.length, entry + 8);
      header.writeUInt32LE(offset, entry + 12);
      offset += png.length;
    });
    await writeFile(
      new URL('favicon.ico', directory),
      Buffer.concat([header, ...sizes.map((size) => pngs.get(size))])
    );
  }

  const specimens = concepts
    .map(
      (c, i) => `<article>
    <div class="caption"><span>0${i + 1} / ${c.tag}</span></div>
    <div class="hero"><img src="./${c.slug}/favicon.svg" alt="${c.name} favicon" width="164" height="164"></div>
    <h2>${c.name}</h2><p>${c.note}</p>
    <div class="sizes">${[16, 32, 48].map((s) => `<div><img src="./${c.slug}/favicon-${s}.png" width="${s}" height="${s}" alt="${s} pixel ${c.name}"><span>${s}px</span></div>`).join('')}</div>
    <div class="tabs"><div class="tab light"><img src="./${c.slug}/favicon-16.png" width="16" height="16" alt="">Rahim Neal Yakoob <span>×</span></div><div class="tab dark"><img src="./${c.slug}/favicon-16.png" width="16" height="16" alt="">Rahim Neal Yakoob <span>×</span></div></div>
    <div class="links"><button data-icon="${c.slug}" aria-pressed="false">Try in this tab ↗</button><a href="./${c.slug}/favicon.svg" download>SVG ↓</a><a href="./${c.slug}/favicon.ico" download>ICO ↓</a></div>
  </article>`
    )
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rahim / Favicon studies</title><link id="favicon" rel="icon" href="./cut-r/favicon.svg"><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f1eb;color:#191815;font-family:Arial,Helvetica,sans-serif}main{max-width:1600px;margin:auto;padding:56px 48px}header{border-bottom:1px solid #b7b5ae;padding-bottom:32px;display:flex;justify-content:space-between;align-items:end;gap:24px}.eyebrow,.caption,.sizes span,.footer{font:11px monospace;text-transform:uppercase;letter-spacing:.08em}h1{font-size:clamp(36px,5vw,68px);letter-spacing:-.065em;line-height:1;margin:16px 0 0;font-weight:800}header p{max-width:285px;font-size:14px;line-height:1.5;margin:0}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:32px}article{padding:0 24px;border-right:1px solid #cfcdc6}article:first-child{padding-left:0}article:last-child{border:0;padding-right:0}.caption{height:30px;color:#5e5c56}.hero{height:224px;display:grid;place-items:center;background:#e9e7e0}.hero img{filter:drop-shadow(0 14px 12px #19181518)}h2{font-size:30px;letter-spacing:-.045em;margin:26px 0 10px}article p{font-size:14px;line-height:1.55;min-height:90px;margin:0;color:#55534d}.sizes{height:112px;display:flex;gap:28px;align-items:end;padding-bottom:24px}.sizes div{display:flex;align-items:center;flex-direction:column;gap:12px}.sizes span{font-size:10px;color:#66645d}.tabs{display:grid;gap:8px}.tab{height:43px;display:flex;align-items:center;gap:10px;padding:0 12px;font-size:11px;border-radius:8px 8px 0 0}.tab span{margin-left:auto;font-size:16px}.light{background:#fff;color:#343434;border:1px solid #d8d7d2}.dark{background:#292a2d;color:#e8eaed}.links{display:flex;align-items:center;gap:12px;margin-top:22px;flex-wrap:wrap}.links a,.links button{color:inherit;font:11px monospace;background:none;border:0;padding:0;text-decoration:underline;text-underline-offset:4px;cursor:pointer}.links button[aria-pressed=true]{color:#b32600}button:focus-visible,a:focus-visible{outline:2px solid #b32600;outline-offset:5px}.footer{margin-top:38px;border-top:1px solid #b7b5ae;padding-top:20px;display:flex;justify-content:space-between;gap:20px;line-height:1.6}@media(max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:40px 0}article:nth-child(2){border:0}article:nth-child(3){padding-left:0}article p{min-height:65px}}@media(max-width:560px){main{padding:30px 24px}header{display:block}header p{margin-top:24px}.grid{display:block}article{padding:0 0 32px!important;border:0;margin-bottom:32px;border-bottom:1px solid #b7b5ae}.footer{display:block}.hero{height:250px}article p{min-height:0}}
  </style></head><body><main><header><div><div class="eyebrow">Rahim Neal Yakoob / Identity studies</div><h1>Small mark. Big character.</h1></div><p>Four favicon directions, drawn as vectors and checked at real tab sizes. Start with Cut R.</p></header><div class="grid">${specimens}</div><div class="footer"><span>SVG + ICO + PNG / 16–512px<br>Static assets · No animation · No external dependencies</span><span>Cut R → strongest fit for the current site<br>Fusion → strongest standalone symbol</span></div><p id="status" role="status"></p></main><script>document.querySelectorAll('[data-icon]').forEach(button=>button.addEventListener('click',()=>{document.getElementById('favicon').href='./'+button.dataset.icon+'/favicon.svg';document.querySelectorAll('[data-icon]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));document.getElementById('status').textContent='Previewing '+button.closest('article').querySelector('h2').textContent+' in this browser tab.';}));</script></body></html>`;
  const finalHtml = pixelStudy
    ? html
        .replace(
          'href="./cut-r/favicon.svg"',
          'href="./pixel-heat-r/favicon.svg"'
        )
        .replace('Small mark. Big character.', 'Thermal, in pixels.')
        .replace(
          'Four favicon directions, drawn as vectors and checked at real tab sizes. Start with Cut R.',
          'Your Thermal R, explored as a pixelated heat map. The original is saved alongside three new variations.'
        )
        .replace(
          'Cut R → strongest fit for the current site<br>Fusion → strongest standalone symbol',
          'Pixel Heat R → the strongest small-size mark<br><a href="../index.html">Original collection ↗</a> · <a href="../originals.zip" download>Saved originals ↓</a>'
        )
    : html;
  await writeFile(
    new URL('index.html', output),
    await format(finalHtml, { ...formatOptions, parser: 'html' })
  );
  await page.goto(new URL('index.html', output).href);
  await page.evaluate(() =>
    Promise.all([...document.images].map((img) => img.decode()))
  );
  await page.screenshot({
    path: fileURLToPath(new URL('preview.png', output)),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Try in this tab' }).nth(1).click();
  if (
    !(await page.locator('#favicon').getAttribute('href')).includes(
      pixelStudy ? 'pixel-heat-r/' : 'fusion/'
    )
  )
    throw new Error('Tab preview did not update');
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error('Mobile preview overflows');
  console.log(
    `Generated and verified ${concepts.length} favicon packs in ${fileURLToPath(output)}`
  );
} finally {
  await browser.close();
}

// Publish only the selected icon; comparison pages and source variants stay local.
if (pixelStudy) {
  await cp(
    new URL('pixel-heat-r/', output),
    new URL(
      '../../public/favicons/thermal-pixels/pixel-heat-r/',
      import.meta.url
    ),
    { recursive: true }
  );
}
