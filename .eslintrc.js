module.exports = {
    env: {
        node: true,
        jquery: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:promise/recommended',
        'plugin:unicorn/recommended',
        'plugin:jest/recommended',
        'plugin:prettier/recommended',
        'prettier',
    ],
    plugins: ['html', 'promise', 'jest', 'prettier'],
    globals: { RED: true },
    rules: {
        'prettier/prettier': [
            'warn',
            {
                trailingComma: 'es5',
                tabWidth: 4,
                useTabs: false,
                semi: true,
                singleQuote: true,
                bracketSpacing: true,
                endOfLine: 'auto',
                printWidth: 120,
            },
        ],
        'no-var': 'error',
        'prefer-arrow-callback': 'off', // can be dangerous with --fix option

        'capitalized-comments': 'off',
        'no-unused-vars': [
            'error',
            {
                args: 'all',
                argsIgnorePattern: '^_',
                vars: 'all',
                varsIgnorePattern: '^_',
            },
        ],
        'promise/always-return': 'off',
        'promise/no-return-wrap': 'warn',
        'promise/param-names': 'warn',
        'promise/catch-or-return': 'warn',
        'promise/no-native': 'off',
        'promise/no-nesting': 'warn',
        'promise/no-promise-in-callback': 'warn',
        'promise/no-callback-in-promise': 'warn',
        'promise/avoid-new': 'off',
        'promise/no-new-statics': 'error',
        'promise/no-return-in-finally': 'warn',
        'promise/valid-params': 'warn',
        'unicorn/prefer-module': 'off',
        'unicorn/prefer-node-protocol': 'off',
    },
};
