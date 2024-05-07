'use strict';
// import Base from 'mocha/lib/reporters/base';
// import { constants } from 'mocha/lib/runner';
const fs = require('fs')
const path = require('path')
const Mocha = require('mocha')
const Base = require('mocha/lib/reporters/base')
const utils = require('mocha/lib/utils');
const createUnsupportedError = require('mocha/lib/errors').createUnsupportedError;
const {
  EVENT_SUITE_BEGIN, // 'suite'
  EVENT_TEST_BEGIN, // 'test'
  EVENT_TEST_PASS, // 'pass'
  EVENT_TEST_FAIL, // 'fail'
  EVENT_HOOK_BEGIN, // 'hook'
  EVENT_TEST_RETRY, // 'retry'
  EVENT_TEST_END, // 'test end'
  EVENT_RUN_END, // 'end'
} = Mocha.Runner.constants

function MochaSeleniumReporter(runner, options) {

  Base.call(this, runner, options)

  let self = this;
  let tests = []
  let failures = []
  let passes = []
  let output

  if (options.reporterOption && options.reporterOption.output) {
    if (utils.isBrowser()) {
      throw createUnsupportedError('file output not supported in browser');
    }
    output = options.reporterOption.output;
  }

  runner.on(EVENT_TEST_END, function (test) {
    tests.push(test);
  });

  runner.on(EVENT_TEST_PASS, function (test) {
    passes.push(test);
  });

  runner.on(EVENT_TEST_FAIL, function (test) {
    failures.push(test);
  });

  runner.once(EVENT_RUN_END, function () {
    var obj = {
      stats: self.stats,
      tests: tests.map(clean),
      failures: failures.map(clean),
      passes: passes.map(clean)
    };

    runner.testResults = obj;

    var json = JSON.stringify(obj, null, 2);

    if (output) {
      if ( fs.existsSync(path.resolve(output)) ) {
        try {
          const data = JSON.parse(fs.readFileSync(path.resolve(output), 'utf-8'))
          const newdata = mergeReports(data, obj)
          const sendit = JSON.stringify(newdata, null , 2)
          fs.writeFileSync(output, sendit)
        } catch (error) {
          console.log(error)
        }
      } else {
        try {
          fs.mkdirSync(path.dirname(output), {recursive: true});
          fs.writeFileSync(output, json);
        } catch (err) {
          console.error(
            `${Base.symbols.err} [mocha] writing output to "${output}" failed: ${err.message}\n`
          );
          process.stdout.write(json);
        }
      }
    } else {
      process.stdout.write(json);
    }
  });
}

function clean(test) {
  var err = test.err || {};
  if (err instanceof Error) {
    err = errorJSON(err);
  }

  return {
    title: test.title,
    fullTitle: test.fullTitle(),
    file: test.file,
    duration: test.duration,
    currentRetry: test.currentRetry(),
    speed: test.speed,
    err: cleanCycles(err)
  };
}

function cleanCycles(obj) {
  var cache = [];
  return JSON.parse(
    JSON.stringify(obj, function (key, value) {
      if (typeof value === 'object' && value !== null) {
        if (cache.indexOf(value) !== -1) {
          // Instead of going in a circle, we'll print [object Object]
          return '' + value;
        }
        cache.push(value);
      }

      return value;
    })
  );
}

function errorJSON(err) {
  var res = {};
  Object.getOwnPropertyNames(err).forEach(function (key) {
    res[key] = err[key];
  }, err);
  return res;
}

function mergeReports(obj1, obj2) {
  const result = { ...obj1 };

  for (const key in obj2) {
    if (obj2.hasOwnProperty(key)) {
      const val1 = obj1[key];
      const val2 = obj2[key];

      if (key === 'stats') {
        // Increment specific stats like suites, tests, passes, and failures
        result[key] = { ...val1 };

        ['suites', 'tests', 'passes', 'failures'].forEach(statKey => {
          const val1Stat = val1[statKey] || 0;
          const val2Stat = val2[statKey] || 0;
          result[key][statKey] = val1Stat + val2Stat;
        });

        // Determine percentages
        const passPercentage = (result[key].tests / result[key].passes) * 100;
        const failingPercentage = (result[key].failures / result[key].tests) * 100;

        result[key].passPercentage = passPercentage
        result[key].failingPercentage = failingPercentage

        // Add total stats duration together with individual test duration
        result[key].duration = (val1.duration || 0) + (val2.duration || 0);

        // Set stats test end time to latest test end time.
        result[key].end = val2.end

        // Test appending
      } else if (Array.isArray(val1) && Array.isArray(val2)) {
        // Merge arrays by concatenating them
        result[key] = val1.concat(val2);
      } else if (typeof val1 === 'object' && typeof val2 === 'object') {
        // Merge objects recursively
        result[key] = mergeReports(val1, val2);
      } else {
        // Otherwise, simply overwrite
        result[key] = val2;
      }
    }
  }

  return result;
}

module.exports = MochaSeleniumReporter;