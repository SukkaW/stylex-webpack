'use strict';

module.exports = require('eslint-config-sukka').sukka({
  react: false
}, {
  rules: {
    'sukka/unicorn/no-empty-file': 'off'
  }
});
