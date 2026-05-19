const featureNames = [
  'auth',
  'business',
  'home',
  'info',
  'offer',
  'order',
  'support',
  'workspace',
];

const crossFeatureRules = featureNames.map((featureName) => ({
  name: `no-${featureName}-cross-feature-imports`,
  severity: 'error',
  comment: `Keep the ${featureName} feature isolated. Shared models, services, and UI belong in src/app/shared or src/app/core.`,
  from: {
    path: `^src/app/feature/${featureName}/`,
  },
  to: {
    path: `^src/app/feature/(?!${featureName}/)`,
  },
}));

const workspaceRule = crossFeatureRules.find(
  (rule) => rule.name === 'no-workspace-cross-feature-imports',
);

if (workspaceRule) {
  workspaceRule.to.pathNot = '^src/app/feature/support/components/support-chat-widget/';
}

module.exports = {
  forbidden: crossFeatureRules,
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: '\\.(spec|test)\\.ts$',
    tsConfig: {
      fileName: 'tsconfig.app.json',
    },
    tsPreCompilationDeps: true,
  },
};
