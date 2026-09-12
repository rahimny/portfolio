import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { getStudy } from '@/features/lab/registry';
import {
  ARTBOARD,
  PALETTES,
  PRESETS,
  RATIO_SYSTEMS,
  describeArc,
  generateFocalBlocks,
  rayToBounds,
  type CompositionShape,
  type Geometry,
  type LayerOrder,
  type MaskMode,
  type Palette,
  type PaletteId,
  type RatioSystem,
  type TextAlign,
  type TextPlacement,
} from '@/features/swiss-grid/model';

function RangeControl({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label htmlFor={id} className="block border-b border-border py-3">
      <span className="mb-2 flex items-baseline justify-between gap-4">
        <span className="font-meta text-fg-muted">{label}</span>
        <span className="font-mono text-xs text-fg">
          {value}
          {unit}
        </span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-6 w-full cursor-pointer accent-brand"
      />
    </label>
  );
}

function GridArtwork({
  columns,
  rows,
  margin,
  gutter,
  depth,
  angle,
  formCount,
  seed,
  geometry,
  ratioSystem,
  focusX,
  focusY,
  spokes,
  ringCount,
  rotation,
  shapeWeight,
  palette,
  showGrid,
  showBaseline,
  showConstruction,
  showText,
  title,
  textPlacement,
  textAlign,
  textSize,
  maskMode,
  maskInset,
  maskSize,
  invertMask,
  maskText,
  layerOrder,
  svgRef,
}: {
  columns: number;
  rows: number;
  margin: number;
  gutter: number;
  depth: number;
  angle: number;
  formCount: number;
  seed: number;
  geometry: Geometry;
  ratioSystem: RatioSystem;
  focusX: number;
  focusY: number;
  spokes: number;
  ringCount: number;
  rotation: number;
  shapeWeight: number;
  palette: Palette;
  showGrid: boolean;
  showBaseline: boolean;
  showConstruction: boolean;
  showText: boolean;
  title: string;
  textPlacement: TextPlacement;
  textAlign: TextAlign;
  textSize: number;
  maskMode: MaskMode;
  maskInset: number;
  maskSize: number;
  invertMask: boolean;
  maskText: boolean;
  layerOrder: LayerOrder;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const clipId = `swiss-grid-${useId().replace(/:/g, '')}`;
  const maskId = `${clipId}-mask`;
  const ratioValues =
    RATIO_SYSTEMS.find((option) => option.id === ratioSystem)?.values ??
    RATIO_SYSTEMS[0].values;
  const shapes = useMemo(
    () =>
      generateFocalBlocks(
        columns,
        rows,
        formCount,
        seed,
        focusX,
        focusY,
        spokes,
        ratioValues
      ),
    [columns, focusX, focusY, formCount, ratioValues, rows, seed, spokes]
  );
  const innerWidth = ARTBOARD.width - margin * 2;
  const innerHeight = ARTBOARD.height - margin * 2;
  const columnWidth = (innerWidth - gutter * (columns - 1)) / columns;
  const rowHeight = (innerHeight - gutter * (rows - 1)) / rows;
  const radians = (angle * Math.PI) / 180;
  const dx = depth * Math.cos(radians);
  const dy = -depth * Math.sin(radians);
  const getX = (column: number) => margin + column * (columnWidth + gutter);
  const getY = (row: number) => margin + row * (rowHeight + gutter);
  const getWidth = (span: number) => columnWidth * span + gutter * (span - 1);
  const getHeight = (span: number) => rowHeight * span + gutter * (span - 1);
  const tone = (name: CompositionShape['tone']) => palette[name];
  const projectionDepth = (shape: CompositionShape) => {
    const centreX = getX(shape.column) + getWidth(shape.columnSpan) / 2;
    const centreY = getY(shape.row) + getHeight(shape.rowSpan) / 2;
    return centreY * Math.sin(radians) - centreX * Math.cos(radians);
  };
  const orderedShapes = [...shapes].sort((a, b) => {
    if (layerOrder === 'grid') {
      return a.row * columns + a.column - (b.row * columns + b.column);
    }
    const delta = projectionDepth(a) - projectionDepth(b);
    return layerOrder === 'reverse' ? -delta : delta;
  });
  const focalX = margin + innerWidth * (focusX / 100);
  const focalY = margin + innerHeight * (focusY / 100);
  const maxRadius = Math.max(innerWidth, innerHeight) * 0.62;
  const fieldMaskX = margin + maskInset;
  const fieldMaskY = margin + maskInset;
  const fieldMaskWidth = Math.max(1, innerWidth - maskInset * 2);
  const fieldMaskHeight = Math.max(1, innerHeight - maskInset * 2);
  const maskScale = maskSize / 100;
  const circleMaskRadius = maxRadius * maskScale;
  const windowMaskWidth = innerWidth * maskScale;
  const windowMaskHeight = innerHeight * maskScale;
  const maskBackground = invertMask ? 'white' : 'black';
  const maskReveal = invertMask ? 'black' : 'white';
  const artworkMask = maskMode === 'artboard' ? undefined : `url(#${maskId})`;
  const selectedRatios = ratioValues.slice(
    Math.max(0, ratioValues.length - ringCount)
  );
  const ratioMax = selectedRatios.at(-1) ?? 1;
  const radii = selectedRatios.map((value) => (value / ratioMax) * maxRadius);
  const phase = rotation + (seed % 12) * (360 / spokes / 4);
  const titleLines = title
    .split('/')
    .map((line) => line.trim())
    .filter(Boolean);
  const alignedX =
    textAlign === 'start'
      ? margin
      : textAlign === 'middle'
        ? ARTBOARD.width / 2
        : ARTBOARD.width - margin;
  const textX =
    textPlacement === 'focus'
      ? focalX
      : textPlacement === 'vertical'
        ? ARTBOARD.width - margin
        : alignedX;
  const verticalY =
    textAlign === 'start'
      ? ARTBOARD.height - margin
      : textAlign === 'middle'
        ? ARTBOARD.height / 2
        : margin;
  const textY =
    textPlacement === 'focus'
      ? focalY + textSize * 0.24
      : textPlacement === 'vertical'
        ? verticalY
        : getY(Math.max(1, rows - 2)) + rowHeight * 0.68;
  const textTransform =
    textPlacement === 'vertical'
      ? `rotate(-90 ${ARTBOARD.width - margin} ${verticalY})`
      : undefined;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${ARTBOARD.width} ${ARTBOARD.height}`}
      role="img"
      aria-labelledby={`${clipId}-title ${clipId}-description`}
      className="block size-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id={`${clipId}-title`}>
        Generated Swiss modular grid composition
      </title>
      <desc id={`${clipId}-description`}>
        A {columns} by {rows} {ratioSystem} grid built around a focal point at{' '}
        {focusX} by {focusY}, with {spokes} radial axes and {ringCount} rings.
      </desc>
      <defs>
        <clipPath id={clipId}>
          <rect width={ARTBOARD.width} height={ARTBOARD.height} />
        </clipPath>
        <mask
          id={maskId}
          x="0"
          y="0"
          width={ARTBOARD.width}
          height={ARTBOARD.height}
          maskUnits="userSpaceOnUse"
          style={{ maskType: 'luminance' }}
        >
          <rect
            width={ARTBOARD.width}
            height={ARTBOARD.height}
            fill={maskBackground}
          />
          {maskMode === 'field' && (
            <rect
              x={fieldMaskX}
              y={fieldMaskY}
              width={fieldMaskWidth}
              height={fieldMaskHeight}
              fill={maskReveal}
            />
          )}
          {maskMode === 'circle' && (
            <circle
              cx={focalX}
              cy={focalY}
              r={circleMaskRadius}
              fill={maskReveal}
            />
          )}
          {maskMode === 'window' && (
            <rect
              x={focalX - windowMaskWidth / 2}
              y={focalY - windowMaskHeight / 2}
              width={windowMaskWidth}
              height={windowMaskHeight}
              fill={maskReveal}
            />
          )}
        </mask>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect
          width={ARTBOARD.width}
          height={ARTBOARD.height}
          fill={palette.ground}
        />

        <g mask={artworkMask}>
          {showConstruction && (
            <g
              fill="none"
              stroke={palette.guide}
              strokeWidth="1.25"
              opacity="0.42"
            >
              {Array.from({ length: spokes }, (_, index) => {
                const rayAngle = phase + (index / spokes) * 360;
                const end = rayToBounds(
                  focalX,
                  focalY,
                  rayAngle,
                  margin,
                  margin,
                  ARTBOARD.width - margin,
                  ARTBOARD.height - margin
                );
                return (
                  <line
                    key={`ray-${index}`}
                    x1={focalX}
                    y1={focalY}
                    x2={end.x}
                    y2={end.y}
                  />
                );
              })}
              {radii.map((radius, index) => (
                <circle
                  key={`ratio-ring-${index}`}
                  cx={focalX}
                  cy={focalY}
                  r={radius}
                />
              ))}
              <circle cx={focalX} cy={focalY} r="4" fill={palette.guide} />
            </g>
          )}

          {(geometry === 'radial' || geometry === 'hybrid') && (
            <g fill="none">
              {radii.map((radius, index) => {
                const stepAngle = 360 / spokes;
                const start = phase + index * stepAngle * 1.5;
                const sweepSteps = Math.max(
                  2,
                  Math.min(
                    spokes - 2,
                    Math.round(spokes * (0.28 + index * 0.08))
                  )
                );
                const end = start + sweepSteps * stepAngle;
                const stroke =
                  index === 0
                    ? palette.accent
                    : index % 3 === 1
                      ? palette.quiet
                      : palette.primary;
                const width = Math.max(
                  7,
                  Math.min(shapeWeight * (0.62 + index * 0.16), radius * 0.72)
                );
                const secondStart = end + stepAngle;
                const secondEnd =
                  secondStart + Math.max(1, sweepSteps - 2) * stepAngle;
                return (
                  <g key={`arc-${index}`} stroke={stroke} strokeWidth={width}>
                    <path d={describeArc(focalX, focalY, radius, start, end)} />
                    {index % 2 === 0 && (
                      <path
                        d={describeArc(
                          focalX,
                          focalY,
                          radius,
                          secondStart,
                          secondEnd
                        )}
                        opacity="0.88"
                      />
                    )}
                  </g>
                );
              })}
              <circle
                cx={focalX}
                cy={focalY}
                r={Math.max(10, shapeWeight * 0.78)}
                fill={palette.accent}
              />
            </g>
          )}

          {(geometry === 'blocks' || geometry === 'hybrid') &&
            orderedShapes.map((shape, index) => {
              const x = getX(shape.column);
              const y = getY(shape.row);
              const width = getWidth(shape.columnSpan);
              const height = getHeight(shape.rowSpan);
              const fill = tone(shape.tone);
              const sideFill = `color-mix(in oklab, ${fill} 64%, ${palette.ground})`;
              const topFill = `color-mix(in oklab, ${fill} 78%, ${palette.ground})`;
              const key = `${shape.column}-${shape.row}-${index}`;

              if (shape.kind === 'rule') {
                const ruleHeight = Math.max(5, Math.min(12, height * 0.12));
                return (
                  <g key={key}>
                    <rect
                      x={x}
                      y={y + height - ruleHeight}
                      width={width}
                      height={ruleHeight}
                      fill={fill}
                    />
                    {depth > 0 && (
                      <polygon
                        points={`${x},${y + height - ruleHeight} ${x + dx},${y + height - ruleHeight + dy} ${x + width + dx},${y + height - ruleHeight + dy} ${x + width},${y + height - ruleHeight}`}
                        fill={topFill}
                      />
                    )}
                  </g>
                );
              }

              if (shape.kind === 'disc') {
                const diameter = Math.max(8, Math.min(width, height));
                const cx = x + width / 2;
                const cy = y + height / 2;
                return (
                  <g key={key}>
                    {depth > 0 && (
                      <circle
                        cx={cx + dx}
                        cy={cy + dy}
                        r={diameter / 2}
                        fill={sideFill}
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={diameter / 2}
                      fill={shape.kind === 'disc' ? fill : 'none'}
                    />
                  </g>
                );
              }

              if (shape.kind === 'outline') {
                return (
                  <g key={key}>
                    {depth > 0 && (
                      <rect
                        x={x + dx}
                        y={y + dy}
                        width={width}
                        height={height}
                        fill="none"
                        stroke={sideFill}
                        strokeWidth="5"
                      />
                    )}
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill="none"
                      stroke={fill}
                      strokeWidth="5"
                    />
                    {depth > 0 && (
                      <>
                        <line
                          x1={x}
                          y1={y}
                          x2={x + dx}
                          y2={y + dy}
                          stroke={sideFill}
                          strokeWidth="5"
                        />
                        <line
                          x1={x + width}
                          y1={y}
                          x2={x + width + dx}
                          y2={y + dy}
                          stroke={sideFill}
                          strokeWidth="5"
                        />
                      </>
                    )}
                  </g>
                );
              }

              return (
                <g key={key}>
                  {depth > 0 && (
                    <>
                      <polygon
                        points={`${x},${y} ${x + dx},${y + dy} ${x + width + dx},${y + dy} ${x + width},${y}`}
                        fill={topFill}
                      />
                      <polygon
                        points={`${x + width},${y} ${x + width + dx},${y + dy} ${x + width + dx},${y + height + dy} ${x + width},${y + height}`}
                        fill={sideFill}
                      />
                    </>
                  )}
                  <rect x={x} y={y} width={width} height={height} fill={fill} />
                </g>
              );
            })}
        </g>

        {showBaseline &&
          Array.from({ length: rows * 4 + 1 }, (_, index) => {
            const y = margin + (innerHeight / (rows * 4)) * index;
            return (
              <line
                key={`baseline-${index}`}
                x1={margin}
                x2={ARTBOARD.width - margin}
                y1={y}
                y2={y}
                stroke={palette.guide}
                strokeWidth="0.7"
                opacity="0.28"
              />
            );
          })}

        {showGrid && (
          <g fill="none" stroke={palette.guide} strokeWidth="1" opacity="0.58">
            {Array.from({ length: columns }, (_, column) => (
              <rect
                key={`column-${column}`}
                x={getX(column)}
                y={margin}
                width={columnWidth}
                height={innerHeight}
              />
            ))}
            {Array.from({ length: rows }, (_, row) => (
              <line
                key={`row-${row}`}
                x1={margin}
                x2={ARTBOARD.width - margin}
                y1={getY(row)}
                y2={getY(row)}
              />
            ))}
            <rect
              x={margin}
              y={margin}
              width={innerWidth}
              height={innerHeight}
            />
          </g>
        )}

        {showText && titleLines.length > 0 && (
          <g mask={maskText ? artworkMask : undefined}>
            <g
              fill={palette.primary}
              textAnchor={textAlign}
              transform={textTransform}
            >
              <text
                x={textX}
                y={textY}
                fontFamily="var(--font-display)"
                fontWeight="800"
                fontSize={textSize}
                letterSpacing="-0.055em"
              >
                {titleLines.map((line, index) => (
                  <tspan
                    key={`${line}-${index}`}
                    x={textX}
                    dy={
                      index === 0
                        ? 0
                        : textPlacement === 'vertical'
                          ? -textSize * 0.8
                          : textSize * 0.8
                    }
                  >
                    {line.toUpperCase()}
                  </tspan>
                ))}
              </text>
              <text
                x={textX}
                y={
                  textPlacement === 'vertical'
                    ? textY - titleLines.length * textSize * 0.8 - 18
                    : textY + titleLines.length * textSize * 0.8 + 18
                }
                fontFamily="var(--font-mono)"
                fontSize="10"
                fontWeight="400"
                letterSpacing="0.14em"
              >
                {ratioSystem.toUpperCase()} / FOCUS {focusX}:{focusY} / {spokes}{' '}
                AXES
              </text>
            </g>
          </g>
        )}

        <g
          fill={palette.primary}
          fontFamily="var(--font-mono)"
          fontSize="9"
          letterSpacing="0.14em"
        >
          <text x={margin} y={ARTBOARD.height - 14}>
            MODULAR FIELD / {columns * rows}
          </text>
          <text
            x={ARTBOARD.width - margin}
            y={ARTBOARD.height - 14}
            textAnchor="end"
          >
            RNY-{String(seed).padStart(4, '0')}
          </text>
        </g>
      </g>
    </svg>
  );
}

export default function SwissGridExperiment() {
  const study = getStudy('swiss-grid');
  useDocumentMeta(
    study?.title ?? 'Swiss Grid Composer',
    study?.summary ?? 'A configurable modular-grid composer.'
  );
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(8);
  const [margin, setMargin] = useState(52);
  const [gutter, setGutter] = useState(14);
  const [depth, setDepth] = useState(22);
  const [angle, setAngle] = useState(30);
  const [formCount, setFormCount] = useState(8);
  const [seed, setSeed] = useState(2307);
  const [geometry, setGeometry] = useState<Geometry>('radial');
  const [ratioSystem, setRatioSystem] = useState<RatioSystem>('fibonacci');
  const [focusX, setFocusX] = useState(52);
  const [focusY, setFocusY] = useState(42);
  const [spokes, setSpokes] = useState(12);
  const [ringCount, setRingCount] = useState(5);
  const [rotation, setRotation] = useState(-15);
  const [shapeWeight, setShapeWeight] = useState(48);
  const [paletteId, setPaletteId] = useState<PaletteId>('signal');
  const [showGrid, setShowGrid] = useState(true);
  const [showBaseline, setShowBaseline] = useState(false);
  const [showConstruction, setShowConstruction] = useState(true);
  const [showText, setShowText] = useState(true);
  const [title, setTitle] = useState('Order / Motion');
  const [textPlacement, setTextPlacement] = useState<TextPlacement>('grid');
  const [textAlign, setTextAlign] = useState<TextAlign>('start');
  const [textSize, setTextSize] = useState(54);
  const [maskMode, setMaskMode] = useState<MaskMode>('field');
  const [maskInset, setMaskInset] = useState(0);
  const [maskSize, setMaskSize] = useState(68);
  const [invertMask, setInvertMask] = useState(false);
  const [maskText, setMaskText] = useState(true);
  const [layerOrder, setLayerOrder] = useState<LayerOrder>('projection');
  const [exportMessage, setExportMessage] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const palette =
    PALETTES.find((option) => option.id === paletteId) ?? PALETTES[0];

  const randomise = () => {
    setSeed(Math.floor(Math.random() * 9000) + 1000);
  };

  const downloadSvg = () => {
    const original = svgRef.current;
    if (!original) return;

    const clone = original.cloneNode(true) as SVGSVGElement;
    const originals = [original, ...original.querySelectorAll<SVGElement>('*')];
    const clones = [clone, ...clone.querySelectorAll<SVGElement>('*')];
    originals.forEach((node, index) => {
      const target = clones[index];
      if (!target) return;
      const style = getComputedStyle(node);
      [
        'fill',
        'stroke',
        'color',
        'font-family',
        'font-size',
        'font-weight',
        'letter-spacing',
      ].forEach((property) => {
        const value = style.getPropertyValue(property);
        if (value) target.style.setProperty(property, value);
      });
    });
    clone.setAttribute('width', String(ARTBOARD.width));
    clone.setAttribute('height', String(ARTBOARD.height));

    const source = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `swiss-grid-${seed}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportMessage(`Downloaded swiss-grid-${seed}.svg`);
    window.setTimeout(() => setExportMessage(''), 2400);
  };

  return (
    <div className="min-h-dvh bg-bg pt-[var(--navbar-height)] text-fg">
      <header className="border-b border-border px-[var(--gutter)] py-4">
        <div className="mx-auto flex max-w-[var(--content-max)] flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <Link
              to="/experiments"
              className="font-meta text-fg-subtle transition-colors duration-(--dur-fast) hover:text-fg"
            >
              ← Lab 007
            </Link>
            <h1 className="font-display text-xl uppercase sm:text-2xl">
              Swiss Grid Composer
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={randomise}
              className="border border-border px-3 py-2 font-meta transition-colors duration-(--dur-fast) hover:border-ink hover:bg-surface"
            >
              New composition
            </button>
            <button
              type="button"
              onClick={downloadSvg}
              className="border border-ink bg-ink px-3 py-2 font-meta text-on-ink transition-colors duration-(--dur-fast) hover:bg-brand hover:text-on-brand"
            >
              Export SVG
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[var(--content-max)] gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="relative flex items-start justify-center overflow-visible bg-surface-2 p-4 sm:p-8 lg:min-h-[70vh] lg:p-12">
          <div
            className="relative aspect-[4/5] w-full max-w-[min(58vh,45rem)] border border-border-strong bg-surface lg:sticky lg:top-[calc(var(--navbar-height)+2rem)]"
            data-artboard
          >
            <GridArtwork
              columns={columns}
              rows={rows}
              margin={margin}
              gutter={gutter}
              depth={depth}
              angle={angle}
              formCount={formCount}
              seed={seed}
              geometry={geometry}
              ratioSystem={ratioSystem}
              focusX={focusX}
              focusY={focusY}
              spokes={spokes}
              ringCount={ringCount}
              rotation={rotation}
              shapeWeight={shapeWeight}
              palette={palette}
              showGrid={showGrid}
              showBaseline={showBaseline}
              showConstruction={showConstruction}
              showText={showText}
              title={title}
              textPlacement={textPlacement}
              textAlign={textAlign}
              textSize={textSize}
              maskMode={maskMode}
              maskInset={maskInset}
              maskSize={maskSize}
              invertMask={invertMask}
              maskText={maskText}
              layerOrder={layerOrder}
              svgRef={svgRef}
            />
          </div>
          <div
            aria-live="polite"
            className="pointer-events-none absolute bottom-3 left-3 font-meta text-fg-muted"
          >
            {exportMessage}
          </div>
        </section>

        <aside className="border-t border-border bg-bg lg:border-l lg:border-t-0">
          <div className="border-b border-border p-5">
            <p className="font-meta text-fg-subtle">Construction</p>
            <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-fg-muted">
              One focal point drives the axes, proportional rings, snapped forms
              and type. The seed changes the sequence, never the system.
            </p>
            <p className="mt-3 font-meta text-fg-subtle">Cost</p>
            <p className="mt-1 max-w-[34ch] text-sm leading-relaxed text-fg-muted">
              Not yet measured on real hardware.
            </p>
          </div>

          <div className="p-5">
            <fieldset>
              <legend className="mb-3 font-meta text-fg-subtle">
                Field presets
              </legend>
              <div className="grid grid-cols-3 gap-1">
                {PRESETS.map((preset) => {
                  const active =
                    columns === preset.columns && rows === preset.rows;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setColumns(preset.columns);
                        setRows(preset.rows);
                      }}
                      className={`border px-2 py-2 font-meta transition-colors duration-(--dur-fast) ${
                        active
                          ? 'border-ink bg-ink text-on-ink'
                          : 'border-border text-fg-muted hover:border-ink hover:text-fg'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-4">
              <RangeControl
                id="grid-columns"
                label="Columns"
                value={columns}
                min={2}
                max={12}
                onChange={setColumns}
              />
              <RangeControl
                id="grid-rows"
                label="Rows"
                value={rows}
                min={3}
                max={16}
                onChange={setRows}
              />
              <RangeControl
                id="grid-margin"
                label="Margin"
                value={margin}
                min={28}
                max={90}
                unit="px"
                onChange={setMargin}
              />
              <RangeControl
                id="grid-gutter"
                label="Gutter"
                value={gutter}
                min={4}
                max={28}
                unit="px"
                onChange={setGutter}
              />
            </div>

            <fieldset className="mt-6 border-b border-border pb-5">
              <legend className="mb-3 font-meta text-fg-subtle">
                Shape family
              </legend>
              <div className="grid grid-cols-3 gap-1">
                {(['radial', 'blocks', 'hybrid'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={geometry === option}
                    onClick={() => setGeometry(option)}
                    className={`border px-2 py-2 font-meta capitalize transition-colors duration-(--dur-fast) ${
                      geometry === option
                        ? 'border-ink bg-ink text-on-ink'
                        : 'border-border text-fg-muted hover:border-ink hover:text-fg'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-6 border-b border-border pb-5">
              <legend className="mb-3 font-meta text-fg-subtle">
                Proportion system
              </legend>
              <div className="grid grid-cols-3 gap-1">
                {RATIO_SYSTEMS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={ratioSystem === option.id}
                    onClick={() => setRatioSystem(option.id)}
                    className={`border px-2 py-2 font-meta transition-colors duration-(--dur-fast) ${
                      ratioSystem === option.id
                        ? 'border-ink bg-ink text-on-ink'
                        : 'border-border text-fg-muted hover:border-ink hover:text-fg'
                    }`}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-3">
              <RangeControl
                id="focus-x"
                label="Focus X"
                value={focusX}
                min={15}
                max={85}
                unit="%"
                onChange={setFocusX}
              />
              <RangeControl
                id="focus-y"
                label="Focus Y"
                value={focusY}
                min={15}
                max={85}
                unit="%"
                onChange={setFocusY}
              />
              <RangeControl
                id="radial-spokes"
                label="Axes"
                value={spokes}
                min={6}
                max={24}
                onChange={setSpokes}
              />
              <RangeControl
                id="radial-rings"
                label="Ratio rings"
                value={ringCount}
                min={2}
                max={6}
                onChange={setRingCount}
              />
              <RangeControl
                id="radial-rotation"
                label="Rotation"
                value={rotation}
                min={-90}
                max={90}
                unit="°"
                onChange={setRotation}
              />
              {geometry !== 'blocks' && (
                <RangeControl
                  id="shape-weight"
                  label="Arc weight"
                  value={shapeWeight}
                  min={10}
                  max={86}
                  unit="px"
                  onChange={setShapeWeight}
                />
              )}
              {geometry !== 'radial' && (
                <>
                  <RangeControl
                    id="grid-forms"
                    label="Block forms"
                    value={formCount}
                    min={2}
                    max={18}
                    onChange={setFormCount}
                  />
                  <RangeControl
                    id="grid-depth"
                    label="Depth"
                    value={depth}
                    min={0}
                    max={38}
                    unit="px"
                    onChange={setDepth}
                  />
                  <RangeControl
                    id="grid-angle"
                    label="Projection"
                    value={angle}
                    min={15}
                    max={45}
                    unit="°"
                    onChange={setAngle}
                  />
                  <fieldset className="mt-4">
                    <legend className="mb-2 font-meta text-fg-subtle">
                      Layer order
                    </legend>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          ['projection', 'Auto'],
                          ['grid', 'Grid'],
                          ['reverse', 'Reverse'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={layerOrder === value}
                          onClick={() => setLayerOrder(value)}
                          className={`border px-2 py-2 font-meta transition-colors duration-(--dur-fast) ${
                            layerOrder === value
                              ? 'border-ink bg-ink text-on-ink'
                              : 'border-border text-fg-muted hover:border-ink hover:text-fg'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}
            </div>

            <fieldset className="mt-6 border-t border-border pt-5">
              <legend className="font-meta text-fg-subtle">Masking</legend>
              <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
                Crop the constructed geometry without changing its underlying
                proportions.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-1">
                {(
                  [
                    ['artboard', 'Artboard'],
                    ['field', 'Grid field'],
                    ['circle', 'Focal circle'],
                    ['window', 'Focal window'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={maskMode === value}
                    onClick={() => setMaskMode(value)}
                    className={`border px-2 py-2 font-meta transition-colors duration-(--dur-fast) ${
                      maskMode === value
                        ? 'border-ink bg-ink text-on-ink'
                        : 'border-border text-fg-muted hover:border-ink hover:text-fg'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {maskMode === 'field' && (
                <RangeControl
                  id="mask-inset"
                  label="Field inset"
                  value={maskInset}
                  min={0}
                  max={64}
                  unit="px"
                  onChange={setMaskInset}
                />
              )}

              {(maskMode === 'circle' || maskMode === 'window') && (
                <RangeControl
                  id="mask-size"
                  label="Mask size"
                  value={maskSize}
                  min={20}
                  max={120}
                  unit="%"
                  onChange={setMaskSize}
                />
              )}

              {maskMode !== 'artboard' && (
                <>
                  <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 py-1 text-sm">
                    <span>Invert to negative space</span>
                    <input
                      type="checkbox"
                      checked={invertMask}
                      onChange={(event) => setInvertMask(event.target.checked)}
                      className="size-4 accent-brand"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-4 py-2 text-sm">
                    <span>Apply mask to typography</span>
                    <input
                      type="checkbox"
                      checked={maskText}
                      onChange={(event) => setMaskText(event.target.checked)}
                      className="size-4 accent-brand"
                    />
                  </label>
                </>
              )}
            </fieldset>

            <fieldset className="mt-6 border-t border-border pt-5">
              <legend className="font-meta text-fg-subtle">Typography</legend>
              <label
                htmlFor="composition-title"
                className="mt-3 block font-meta text-fg-muted"
              >
                Display text
              </label>
              <input
                id="composition-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Order / Motion"
                className="mt-2 w-full border border-border-strong bg-surface px-3 py-2 font-sans text-base text-fg"
              />
              <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
                Use a slash to force a grid-aligned line break.
              </p>

              <div className="mt-4">
                <p className="mb-2 font-meta text-fg-subtle">Placement</p>
                <div className="grid grid-cols-3 gap-1">
                  {(['grid', 'focus', 'vertical'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={textPlacement === option}
                      onClick={() => setTextPlacement(option)}
                      className={`border px-2 py-2 font-meta capitalize transition-colors duration-(--dur-fast) ${
                        textPlacement === option
                          ? 'border-ink bg-ink text-on-ink'
                          : 'border-border text-fg-muted hover:border-ink hover:text-fg'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-2 font-meta text-fg-subtle">Alignment</p>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      ['start', 'Left'],
                      ['middle', 'Centre'],
                      ['end', 'Right'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={textAlign === value}
                      onClick={() => setTextAlign(value)}
                      className={`border px-2 py-2 font-meta transition-colors duration-(--dur-fast) ${
                        textAlign === value
                          ? 'border-ink bg-ink text-on-ink'
                          : 'border-border text-fg-muted hover:border-ink hover:text-fg'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <RangeControl
                id="type-scale"
                label="Type scale"
                value={textSize}
                min={24}
                max={96}
                unit="px"
                onChange={setTextSize}
              />

              <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 py-2 text-sm">
                <span>Show typography</span>
                <input
                  type="checkbox"
                  checked={showText}
                  onChange={(event) => setShowText(event.target.checked)}
                  className="size-4 accent-brand"
                />
              </label>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="mb-3 font-meta text-fg-subtle">
                Design-system colour
              </legend>
              <div className="grid grid-cols-2 gap-1">
                {PALETTES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={paletteId === option.id}
                    onClick={() => setPaletteId(option.id)}
                    className={`border p-2 text-left transition-colors duration-(--dur-fast) ${
                      paletteId === option.id
                        ? 'border-ink'
                        : 'border-border hover:border-ink'
                    }`}
                  >
                    <span className="mb-2 flex h-6" aria-hidden="true">
                      <span
                        className="flex-1"
                        style={{ background: option.ground }}
                      />
                      <span
                        className="flex-1"
                        style={{ background: option.primary }}
                      />
                      <span
                        className="flex-1"
                        style={{ background: option.accent }}
                      />
                    </span>
                    <span className="font-meta text-fg-muted">
                      {option.name}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-6 border-t border-border pt-4">
              <legend className="font-meta text-fg-subtle">Guides</legend>
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 py-1 text-sm">
                <span>Focal axes + ratios</span>
                <input
                  type="checkbox"
                  checked={showConstruction}
                  onChange={(event) =>
                    setShowConstruction(event.target.checked)
                  }
                  className="size-4 accent-brand"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 py-1 text-sm">
                <span>Modular grid</span>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(event) => setShowGrid(event.target.checked)}
                  className="size-4 accent-brand"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 py-2 text-sm">
                <span>Baseline divisions</span>
                <input
                  type="checkbox"
                  checked={showBaseline}
                  onChange={(event) => setShowBaseline(event.target.checked)}
                  className="size-4 accent-brand"
                />
              </label>
            </fieldset>
          </div>
        </aside>
      </div>
    </div>
  );
}
