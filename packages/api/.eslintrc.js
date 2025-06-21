module.exports = {
  root: true,
  extends: ["@buddybot/eslint-config/base"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
}; 