import fs from 'fs';
import { format } from 'prettier';

// Constants
const PATHS = {
  EXPERIMENT_TEMPLATE: 'src/pages/experiments/_template/Experiment.tsx',
  WEBGL_TEMPLATE: 'src/vanilla-three/experiences/_template/WebGLExperience.ts',
  TSL_TEMPLATE: 'src/vanilla-three/experiences/_template/TSLExperience.ts',
  STUDY_REGISTRY: 'src/features/lab/registry.ts',
};

const EXPERIMENT_TYPES = ['webgl', 'tsl'];

// Parse command line arguments
function parseArguments() {
  const args = process.argv.slice(2);
  let experimentType = 'webgl'; // default
  let rawName = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type') {
      if (i + 1 < args.length && EXPERIMENT_TYPES.includes(args[i + 1])) {
        experimentType = args[i + 1];
        i++; // skip the next argument as it's the type value
      } else {
        console.log('❌ Invalid type. Use --type webgl or --type tsl');
        process.exit(1);
      }
    } else {
      rawName += (rawName ? ' ' : '') + args[i];
    }
  }

  if (!rawName) {
    showUsage();
    process.exit(1);
  }

  return { experimentType, rawName };
}

function showUsage() {
  console.log('🚀 Create Three.js Experiments\n');
  console.log('Usage Options:');
  console.log(
    '  pnpm create:experiment:webgl "my experiment name"        # WebGL experiment'
  );
  console.log(
    '  pnpm create:experiment:tsl "my experiment name"         # TSL experiment'
  );
  console.log(
    '  pnpm create:experiment "my experiment name" --type tsl  # Alternative syntax'
  );
  console.log('\nExamples:');
  console.log('  pnpm create:experiment:webgl "particle system"');
  console.log('  pnpm create:experiment:tsl "shader playground"');
}

function formatName(input) {
  if (!/^[a-zA-Z][a-zA-Z0-9]*(?:[ _-]+[a-zA-Z0-9]+)*$/.test(input)) {
    throw new Error(
      'Use a name starting with a letter, followed by letters, numbers, spaces, hyphens or underscores.'
    );
  }
  const words = input.split(/[\s-_]+/).filter((word) => word.length > 0);
  const pascalCase = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  const kebabCase = words.map((word) => word.toLowerCase()).join('-');
  const title = pascalCase.replace(/([A-Z])/g, ' $1').trim();
  return { pascalCase, kebabCase, title };
}

function applyReplacements(content, replacementMap) {
  let result = Object.entries(replacementMap).reduce(
    (result, [key, value]) => result.replace(new RegExp(key, 'g'), value),
    content
  );

  // Generated imports are real, so remove the template-only compiler directive.
  result = result.replace(/\/\/ @ts-expect-error[^\n]*\n/g, '');

  return result;
}

// Get template paths based on experiment type
function getTemplatePaths(experimentType) {
  return {
    experimentTemplate: PATHS.EXPERIMENT_TEMPLATE,
    experienceTemplate:
      experimentType === 'tsl' ? PATHS.TSL_TEMPLATE : PATHS.WEBGL_TEMPLATE,
  };
}

function addStudyToRegistry(kebabCase, title, experimentType) {
  const content = fs.readFileSync(PATHS.STUDY_REGISTRY, 'utf8');
  const marker = '] as const satisfies readonly Study[];';
  const markerIndex = content.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(`Could not find the study registry insertion point`);
  }

  if (content.includes(`slug: '${kebabCase}'`)) {
    throw new Error(`Study "${kebabCase}" already exists in the registry`);
  }

  const editions = [...content.matchAll(/edition:\s*(\d+)/g)].map((match) =>
    Number(match[1])
  );
  const edition = Math.max(0, ...editions) + 1;
  const renderer = experimentType === 'tsl' ? 'webgpu' : 'webgl';
  const technique =
    experimentType === 'tsl' ? "['Compute', 'TSL']" : "['WebGL']";
  const record = `  {
    edition: ${edition},
    slug: '${kebabCase}',
    title: '${title}',
    summary: '${title} experiment with interactive controls.',
    year: ${new Date().getFullYear()},
    status: 'wip',
    renderer: '${renderer}',
    technique: ${technique},
  },
`;

  return content.slice(0, markerIndex) + record + content.slice(markerIndex);
}

// Check if experiment already exists
function checkExperimentExists(name, kebabCase) {
  const experimentPath = `src/pages/experiments/${name}Experiment.tsx`;
  const experienceDir = `src/vanilla-three/experiences/${kebabCase}`;

  if (fs.existsSync(experimentPath)) {
    console.error(`❌ Experiment ${name} already exists at ${experimentPath}`);
    process.exit(1);
  }

  if (fs.existsSync(experienceDir)) {
    console.error(
      `❌ Experience directory ${kebabCase} already exists at ${experienceDir}`
    );
    process.exit(1);
  }

  return { experimentPath, experienceDir };
}

function generateFiles(name, kebabCase, title, experimentType) {
  const { experimentTemplate, experienceTemplate } =
    getTemplatePaths(experimentType);

  const replacements = {
    EXPERIMENT_CLASS_NAME: `${name}Experience`,
    EXPERIMENT_COMPONENT_NAME: `${name}Experiment`,
    EXPERIMENT_FILE_NAME: `${kebabCase}/${name}Experience`,
    EXPERIMENT_TITLE: title,
  };

  const experimentContent = applyReplacements(
    fs.readFileSync(experimentTemplate, 'utf8'),
    replacements
  );
  const experienceContent = applyReplacements(
    fs.readFileSync(experienceTemplate, 'utf8'),
    replacements
  );

  return { experimentContent, experienceContent };
}

async function main() {
  try {
    const { experimentType, rawName } = parseArguments();
    const { pascalCase: name, kebabCase, title } = formatName(rawName);

    const { experimentPath, experienceDir } = checkExperimentExists(
      name,
      kebabCase
    );
    const { experimentContent, experienceContent } = generateFiles(
      name,
      kebabCase,
      title,
      experimentType
    );
    const registryContent = addStudyToRegistry(
      kebabCase,
      title,
      experimentType
    );

    const files = [
      [experimentPath, experimentContent],
      [`${experienceDir}/${name}Experience.ts`, experienceContent],
      [PATHS.STUDY_REGISTRY, registryContent],
    ];

    const formatted = await Promise.all(
      files.map(async ([path, content]) => [
        path,
        await format(content, {
          parser: 'typescript',
          singleQuote: true,
          trailingComma: 'es5',
        }),
      ])
    );
    fs.mkdirSync(experienceDir, { recursive: true });
    formatted.forEach(([path, content]) => fs.writeFileSync(path, content));

    console.log(
      `✅ Created ${name}Experiment (${experimentType.toUpperCase()})`
    );
    console.log(`📁 src/pages/experiments/${name}Experiment.tsx`);
    console.log(`📁 ${experienceDir}/${name}Experience.ts`);
    console.log(`📊 Added to ${PATHS.STUDY_REGISTRY}`);
    console.log(`🔀 Route discovered from the page filename`);
    console.log(`🚀 View at: http://localhost:6180/experiments/${kebabCase}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

void main();
