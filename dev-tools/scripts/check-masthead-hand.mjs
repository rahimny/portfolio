import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
});
let browser;
let activePage;
const errors = [];
const report = [];
try {
  await server.listen();
  await server.watcher.close();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    args:
      process.env.HAND_GPU === 'native'
        ? ['--use-gl=angle', '--use-angle=metal']
        : [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
  });
  await mkdir('output/masthead-hand', { recursive: true });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      deviceScaleFactor: 1,
      hasTouch: width === 390,
      isMobile: width === 390,
    });
    activePage = page;
    const openGuide = async () => {
      const guide = page.locator('.masthead-play details');
      if (!(await guide.evaluate((node) => node.open)))
        await guide.locator('summary').click();
    };
    page.setDefaultTimeout(60000);
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.mastheadSamples = [];
      window.mastheadFrameCount = 0;
      let previous = 0;
      window.requestAnimationFrame = (callback) =>
        raf((time) => {
          window.mastheadFrameCount++;
          const phase = document.querySelector(
            '.home-masthead canvas[data-phase]'
          )?.dataset.phase;
          const start = performance.now();
          callback(time);
          if (phase && window.mastheadSamples.length < 5000)
            window.mastheadSamples.push({
              phase,
              callbackMs: performance.now() - start,
              intervalMs: time - previous,
            });
          previous = time;
        });
    });
    await page.goto(base);
    const actors = page.locator('.home-masthead canvas[data-phase]');
    await page
      .locator('.home-masthead canvas[data-phase="arriving"]')
      .waitFor();
    assert.equal(
      await page
        .locator('.masthead-play details')
        .evaluate((node) => node.open),
      false,
      'Interaction help starts collapsed'
    );
    assert.equal(await page.locator('.home-employment').isVisible(), true);
    assert.equal(
      await page.locator('.home-intro a[href="#selected-work"]').count(),
      0
    );
    if (width === 390) {
      const layout = await page.evaluate(() => {
        const heading = document.querySelector('.home-masthead h1');
        return {
          lines:
            heading.getBoundingClientRect().height /
            parseFloat(getComputedStyle(heading).lineHeight),
          encounterTop: document
            .querySelector('.home-nereid')
            .getBoundingClientRect().top,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.ok(
        layout.lines < 3.1,
        'The mobile name reserves only three lines'
      );
      assert.ok(
        layout.encounterTop >= 800,
        'The opening viewport belongs entirely to the landing scene'
      );
      assert.equal(layout.overflow, false);
    }
    assert.equal(
      await page
        .getByRole('button', { name: 'Skip intro', exact: true })
        .isVisible(),
      true
    );
    await page.waitForTimeout(1050);
    await page.screenshot({
      path: `output/masthead-hand/${width}-teleport.png`,
    });
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.home-masthead canvas[data-phase]')?.dataset
            .affected
        ) > 0
    );
    await page.waitForTimeout(140);
    await page.screenshot({ path: `output/masthead-hand/${width}-wake.png` });
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.home-masthead canvas[data-phase]')?.dataset
            .shots
        ) >= 9
    );
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.home-masthead canvas[data-phase]')?.dataset
            .activeSeekers
        ) >= 3
    );
    await page.waitForTimeout(450);
    await page.screenshot({
      path: `output/masthead-hand/${width}-seekers.png`,
    });
    await page
      .locator('.home-masthead canvas[data-phase="departing"]')
      .waitFor();
    await page.waitForTimeout(750);
    await page.screenshot({
      path: `output/masthead-hand/${width}-departure.png`,
    });
    await page.locator('.home-masthead canvas[data-phase="idle"]').waitFor();
    await openGuide();
    await page
      .getByRole('button', { name: 'Watch it write', exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    );
    const affected = Number(await actors.getAttribute('data-affected'));
    assert.ok(affected > 100, 'Projectiles transfer momentum to live ink');
    assert.equal(Number(await actors.getAttribute('data-seekers')), 3);
    await openGuide();
    const launch = page.getByRole('button', {
      name: 'Send seekers',
      exact: true,
    });
    await launch.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.home-masthead canvas[data-phase]')?.dataset
            .seekers
        ) === 6
    );
    await page.waitForTimeout(450);
    await page.screenshot({
      path: `output/masthead-hand/${width}-manual-seekers.png`,
    });
    await page.locator('.home-masthead canvas[data-phase="idle"]').waitFor();
    const heading = page.getByRole('heading', { level: 1 });
    const { x, y } = await heading.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const root = node.closest('.masthead-landing');
      const drone = document
        .querySelector('.masthead-drone')
        ?.getBoundingClientRect();
      const points = [0.15, 0.45, 0.8]
        .flatMap((u) =>
          [0.15, 0.4, 0.7].map((v) => ({
            x: box.x + box.width * u,
            y: box.y + box.height * v,
          }))
        )
        .filter(({ x, y }) => {
          const hit = document.elementFromPoint(x, y);
          return (
            hit && root?.contains(hit) && !hit.closest('[data-particle-mode]')
          );
        });
      // Roaming actors can cover a fixed test coordinate. Choose an actual
      // heading hit with clearance for movement between hit testing and input.
      const clearance = ({ x, y }) =>
        drone
          ? Math.hypot(
              x - drone.x - drone.width / 2,
              y - drone.y - drone.height / 2
            )
          : 0;
      points.sort((a, b) => clearance(b) - clearance(a));
      if (!points.length) throw new Error('No unobstructed heading tap target');
      return points[0];
    });
    if (width === 390) {
      await page.touchscreen.tap(x, y);
      assert.equal(
        await page
          .getByRole('textbox', {
            name: 'Type to reshape the heading. Escape restores it.',
            exact: true,
          })
          .evaluate((el) => el === document.activeElement),
        false,
        'Tap does not open a mobile keyboard'
      );
    } else await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.home-masthead canvas[data-phase]')?.dataset
            .seekers
        ) === 9
    );
    await page.locator('.home-masthead canvas[data-phase="idle"]').waitFor();
    if (width === 1280) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 70, y + 20, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(100);
      assert.equal(
        Number(await actors.getAttribute('data-seekers')),
        9,
        'Drag smears without launching'
      );
    } else {
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= 8; i++)
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y - i * 12 }],
        });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      assert.equal(
        Number(await actors.getAttribute('data-seekers')),
        9,
        'Touch scroll does not launch'
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await openGuide();
      await page.getByRole('button', { name: 'Edit text', exact: true }).tap();
      assert.equal(
        await page
          .getByRole('textbox', {
            name: 'Type to reshape the heading. Escape restores it.',
            exact: true,
          })
          .evaluate((el) => el === document.activeElement),
        true,
        'Edit explicitly opens the text field'
      );
      await session.detach();
    }
    await openGuide();
    await launch.click();
    await page.locator('.home-masthead canvas[data-phase="seekers"]').waitFor();
    await page.setViewportSize({ width: width + 10, height: 800 });
    await page.locator('.home-masthead canvas[data-phase="idle"]').waitFor();
    assert.equal(
      Number(await actors.getAttribute('data-active-seekers')),
      0,
      'Resize retires manual flights'
    );
    await page.setViewportSize({ width, height: 800 });
    await openGuide();
    await launch.click();
    await page.locator('.home-masthead canvas[data-phase="seekers"]').waitFor();
    await page.getByRole('button', { name: 'Graph mode', exact: true }).click();
    await page.locator('.home-masthead canvas[data-phase="idle"]').waitFor();
    await launch.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Text mode', exact: true }).click();
    await launch.waitFor();
    const samples = await page.evaluate(() => window.mastheadSamples);
    const percentile = (values, fraction) =>
      values.sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
    report.push({
      width,
      height: 800,
      dpr: 1,
      cpu: cpus()[0].model,
      renderer: process.env.HAND_GPU ?? 'swiftshader',
      affected,
      phases: ['writing', 'arriving', 'shooting', 'seekers', 'idle'].map(
        (phase) => {
          const data = samples.filter(
            (sample) =>
              sample.phase === phase &&
              sample.intervalMs > 1 &&
              sample.intervalMs < 1000
          );
          return {
            phase,
            samples: data.length,
            callbackMedianMs: percentile(
              data.map((s) => s.callbackMs),
              0.5
            ),
            callbackP95Ms: percentile(
              data.map((s) => s.callbackMs),
              0.95
            ),
            intervalMedianMs: percentile(
              data.map((s) => s.intervalMs),
              0.5
            ),
            intervalP95Ms: percentile(
              data.map((s) => s.intervalMs),
              0.95
            ),
          };
        }
      ),
    });
    if (width === 1280) {
      await openGuide();
      await page
        .getByRole('button', { name: 'Watch it write', exact: true })
        .click();
      await page
        .locator('.home-masthead canvas[data-phase="shooting"]')
        .waitFor();
      await page
        .getByRole('button', { name: 'Skip intro', exact: true })
        .click();
      await page.locator('.home-masthead canvas[data-phase="idle"]').waitFor();
      await openGuide();
      await page
        .getByRole('button', { name: 'Watch it write', exact: true })
        .click();
      await page
        .locator('.home-masthead canvas[data-phase="arriving"]')
        .waitFor();
      await page.setViewportSize({ width: 600, height: 800 });
      await page.locator('.home-masthead canvas[data-phase="idle"]').waitFor();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await launch.waitFor({ state: 'hidden' });
      await page
        .getByRole('button', { name: 'Watch it write', exact: true })
        .waitFor({ state: 'hidden' });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page
        .locator('.home-masthead canvas[data-phase="writing"]')
        .waitFor();
      await page.getByRole('link', { name: 'About', exact: true }).click();
      await page
        .getByRole('link', { name: 'Rahim Neal Yakoob, home', exact: true })
        .click();
      await page
        .locator('.home-masthead canvas[data-phase="arriving"]')
        .waitFor();
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight)
      );
      await page.waitForTimeout(150);
      const offscreenSamples = await page.evaluate(
        () => window.mastheadFrameCount
      );
      await page.waitForTimeout(300);
      assert.equal(
        await page.evaluate(() => window.mastheadFrameCount),
        offscreenSamples,
        'Offscreen actors do not advance or render'
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page
        .getByRole('textbox', {
          name: 'Type to reshape the heading. Escape restores it.',
          exact: true,
        })
        .fill('HELLO');
      await page.locator('.home-masthead canvas[data-phase="idle"]').waitFor();
      await page.waitForTimeout(150);
      assert.equal(
        await actors.getAttribute('data-phase'),
        'idle',
        'Typing cancels pending shots'
      );
    }
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const puck = page.getByRole('button', {
      name: 'Launch at the target',
      exact: true,
    });
    await puck.click();
    await page.waitForFunction(
      () =>
        Number(document.querySelector('.masthead-target')?.dataset.hits) === 3
    );
    await page.screenshot({ path: `output/masthead-hand/${width}-target.png` });
    await page.locator('.home-masthead canvas[data-phase="idle"]').waitFor();
    assert.equal(await page.locator('.home-isofield-stage').count(), 0);
    assert.equal(await page.locator('.home-showcase-piece').count(), 2);
    const drone = page.locator('.masthead-drone');
    await drone.waitFor({ state: 'visible' });
    const before = await drone.boundingBox();
    const headingBox = await heading.boundingBox();
    const startX = before.x + before.width / 2;
    const startY = before.y + before.height / 2;
    const endX = headingBox.x + headingBox.width * 0.4;
    const endY = headingBox.y + headingBox.height * 0.45;
    if (width === 390) {
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y: startY }],
      });
      for (let step = 1; step <= 15; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            {
              x: startX + ((endX - startX) * step) / 15,
              y: startY + ((endY - startY) * step) / 15,
            },
          ],
        });
        await page.waitForTimeout(20);
      }
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await session.detach();
    } else {
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 20 });
      await page.waitForTimeout(250);
      assert.equal(await drone.getAttribute('aria-pressed'), 'true');
      await page.mouse.up();
    }
    await page.waitForTimeout(700);
    assert.equal(await drone.getAttribute('aria-pressed'), 'false');
    assert.equal(await drone.getAttribute('data-hint'), 'false');
    const moved = await drone.boundingBox();
    assert.ok(Math.hypot(moved.x - before.x, moved.y - before.y) > 30);
    assert.ok(
      Number(await drone.getAttribute('data-affected')) > 0,
      'Rotor wake reaches live ink'
    );
    await drone.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);
    assert.equal(await drone.getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.equal(await drone.getAttribute('aria-pressed'), 'false');
    await page.screenshot({ path: `output/masthead-hand/${width}-drone.png` });
    const landing = page.getByRole('button', {
      name: 'Land the drone to reveal Pixel Flow',
      exact: true,
    });
    if (width === 390) {
      // The study is below the Nereid section. Touch sends the drone from the
      // visible landing control; dragging is exercised in the masthead above.
      await landing.tap();
    } else {
      await landing.focus();
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(
      () =>
        document.querySelector('.masthead-drone')?.dataset.owner === 'landed'
    );
    assert.equal(await landing.getAttribute('aria-expanded'), 'true');
    await page.screenshot({
      path: `output/masthead-hand/${width}-landing.png`,
    });
    await openGuide();
    await page
      .getByRole('button', { name: 'Watch it write', exact: true })
      .click();
    await page.getByRole('button', { name: 'Skip intro', exact: true }).click();
    await drone.waitFor({ state: 'visible' });
    assert.equal(await drone.getAttribute('aria-pressed'), 'false');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await drone.waitFor({ state: 'detached' });
    assert.equal(await heading.isVisible(), true);
    await page.locator('.artwork-peek').first().click();
    const stillLanding = page.getByRole('button', {
      name: 'Reveal Pixel Flow construction',
      exact: true,
    });
    await stillLanding.click();
    assert.equal(
      await stillLanding.getAttribute('aria-expanded'),
      'true',
      'Reduced motion can reveal the same artwork directly'
    );
    const continuity = await page.evaluate(async (width) => {
      const [{ HomeWorld }, { MastheadActorsRenderer }] = await Promise.all([
        import('/src/features/home/HomeWorld.ts'),
        import('/src/vanilla-three/dom-effects/MastheadActorsRenderer.ts'),
      ]);
      const glyph = {
        advance: 1,
        area: 1,
        cell: 0,
        x: new Float32Array([0, 1]),
        y: new Float32Array([-1, 0]),
        cdf: new Float32Array([1, 2]),
      };
      const scale = width / 8;
      const layout = {
        glyphs: [
          { char: 'R', glyph, u: 0, v: 1, word: 0 },
          { char: 'N', glyph, u: 2, v: 1, word: 1 },
        ],
        scale,
        offsetY: 0,
        lines: 1,
        baselines: [1],
        inkArea: 2,
        caret: { x: 0, y: 0, width: 0, height: 1 },
      };
      const pose = (actor) => [
        ...actor.root.position.toArray(),
        ...actor.root.quaternion.toArray(),
        ...actor.mount.quaternion.toArray(),
      ];
      let finalWritingPose;
      const world = new HomeWorld({
        beginWriting() {},
        write() {},
        finishWriting() {
          // Capture the complete scripted pose, including the writer's gaze,
          // immediately before ownership transfers to the hovering actor.
          view.frameWorld(world);
          finalWritingPose = pose(view.pilots[0].drone);
        },
        cancelWriting() {},
        clearProjectileWake() {},
        aimAt() {
          return false;
        },
        repelInk() {
          return 0;
        },
      });
      world.resize(width, 200, scale, 0);
      world.start(layout);
      const score = world.writing;
      const view = new MastheadActorsRenderer(document.createElement('canvas'));
      try {
        view.setSize(width, 420, 0, 100, scale);
        while (score.time < score.duration - 0.5) world.advance(1 / 120);
        let stayedVisible = true;
        const actor = view.pilots[0].drone;
        while (!score.done) {
          world.advance(1 / 120);
          view.frameWorld(world);
          stayedVisible &&= actor.root.visible;
        }
        const before = finalWritingPose;
        const after = pose(actor);
        return {
          stayedVisible,
          sameActor: actor === view.pilots[0].drone && actor.root.visible,
          poseDelta: Math.max(
            ...before.map((value, i) => Math.abs(value - after[i]))
          ),
        };
      } finally {
        world.dispose();
        view.dispose();
      }
    }, width);
    assert.equal(
      continuity.stayedVisible,
      true,
      'Writer stays visible through departure'
    );
    assert.equal(
      continuity.sameActor,
      true,
      'The same mesh continues into play'
    );
    assert.ok(
      continuity.poseDelta < 1e-6,
      'Body and mount pose survive the handoff'
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    );
    await page.close();
    console.log(
      `PASS ${width}px mechanical hand, through-field wakes, seekers, pointer/keyboard interaction and clean recovery`
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    'output/masthead-hand/performance.json',
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('Masthead hand check failed:', errors);
  if (activePage && !activePage.isClosed()) {
    console.error(
      await activePage
        .locator('.home-masthead canvas[data-phase]')
        .evaluateAll((canvases) =>
          canvases.map((canvas) => ({ ...canvas.dataset }))
        )
    );
    await activePage
      .screenshot({ path: 'output/masthead-hand/failure.png', timeout: 5000 })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
