var fs = require('fs');
var path = require('path');

var Runner = require('../run.js');
var Logger = require('../../util/logger.js');
var Utils = require('../../util/utils.js');
var Selenium = require('../selenium.js');
var ChildProcess = require('./child-process.js');
var ErrorHandler = require('./errorhandler.js');

var SETTINGS_DEPRECTED_VAL = './settings.json';
var SETTINGS_JS_FILE = './nightwatch.conf.js';

function CliRunner(argv) {
  this.settings = null;
  this.argv = argv;
  this.test_settings = null;
  this.output_folder = '';
  this.parallelMode = false;
  this.runningProcesses = {};
  this.cli = require('./cli.js');
}

CliRunner.prototype = {
  /**
   * @param {function} [done]
   * @deprecated - use .setup instead
   * @returns {CliRunner}
   */
  init : function(done) {
    this
      .readSettings()
      .setOutputFolder()
      .parseTestSettings({}, done);

    return this;
  },

  /**
   * @param {object} [settings]
   * @param {function} [done]
   * @returns {CliRunner}
   */
  setup : function(settings, done) {
    this
      .readSettings()
      .setOutputFolder()
      .parseTestSettings(settings, done);

    return this;
  },

  /**
   * Read the provided config json file; defaults to settings.json if one isn't provided
   */
  readSettings : function() {
    // use default nightwatch.json file if we haven't received another value
    if (this.cli.command('config').isDefault(this.argv.config)) {
      var defaultValue = this.cli.command('config').defaults();
      var localJsValue = path.resolve(SETTINGS_JS_FILE);

      if (fs.existsSync(SETTINGS_JS_FILE)) {
        this.argv.config = localJsValue;
      } else if (fs.existsSync(defaultValue)) {
        this.argv.config = path.join(path.resolve('./'), this.argv.config);
      } else if (fs.existsSync(SETTINGS_DEPRECTED_VAL)) {
        this.argv.config = path.join(path.resolve('./'), SETTINGS_DEPRECTED_VAL);
      } else {
        var binFolder = path.resolve(__dirname + '/../../../bin');
        var defaultFile = path.join(binFolder, this.argv.config);
        if (fs.existsSync(defaultFile)) {
          this.argv.config = defaultFile;
        } else {
          this.argv.config = path.join(binFolder, SETTINGS_DEPRECTED_VAL);
        }
      }
    } else {
      this.argv.config = path.resolve(this.argv.config);
    }

    this.argv.env = this.argv.env || 'default';

    // reading the settings file
    try {
      this.settings = require(this.argv.config);
      this.replaceEnvVariables();

      this.manageSelenium = !this.isParallelMode() && this.settings.selenium &&
        this.settings.selenium.start_process || false;

      if (typeof this.settings.src_folders == 'string') {
        this.settings.src_folders = [this.settings.src_folders];
      }

      this.settings.output = this.settings.output || typeof this.settings.output == 'undefined';
    } catch (ex) {
      Logger.error(ex);
      this.settings = {};
    }

    return this;
  },

  /**
   * Looks for pattern ${VAR_NAME} in settings
   * @param {Object} [target]
   */
  replaceEnvVariables : function(target) {
    target = target || this.settings;
    for (var key in target) {
      switch(typeof target[key]) {
      case 'object':
        this.replaceEnvVariables(target[key]);
        break;
      case 'string':
        target[key] = target[key].replace(/\$\{(\w+)\}/g, function(match, varName) {
          return process.env[varName] || '${' + varName + '}';
        });
        break;
      }
    }

    return this;
  },


  /**
   * Reads globals from an external js or json file set in the settings file
   * @returns {*}
   */
  readExternalGlobals : function () {
    if (!this.settings.globals_path) {
      return this;
    }

    try {
      var fullPath = path.resolve(this.settings.globals_path);
      if (fs.existsSync(fullPath)) {
        var globals = this.test_settings.globals = require(fullPath);
        if (globals && globals.hasOwnProperty(this.argv.env)) {
          for (var prop in globals[this.argv.env]) {
            this.test_settings.globals[prop] = globals[this.argv.env][prop];
          }
        }
        return this;
      }

      throw new Error('External global file could not be located - using '+ this.settings.globals_path +'.');
    } catch (err) {
      err.message = 'Failed to load external global file: ' + err.message;
      throw err;
    }
  },

  /**
   * @returns {CliRunner}
   */
  setOutputFolder : function() {
    var isDisabled = this.settings.output_folder === false;
    var isDefault = this.cli.command('output').isDefault(this.argv.output);

    this.output_folder = isDisabled ? false : (isDefault && this.settings.output_folder || this.argv.output);
    return this;
  },

  singleTestRun: function () {
    return typeof this.argv.test == 'string';
  },

  /**
   * Returns the path where the tests are located
   * @returns {*}
   */
  getTestSource : function() {
    var testsource;
    if (this.singleTestRun()) {
      testsource = (this.argv.test.indexOf(process.cwd()) === -1) ?
        path.join(process.cwd(), this.argv.test) :
        this.argv.test;

      if (testsource.substr(-3) != '.js') {
        testsource += '.js';
      }
      try {
        fs.statSync(testsource);
      } catch (err) {
        throw new Error('There was a problem reading the test file: ' + testsource);
      }
    } else {
      if (this.argv.testcase) {
        this.argv.testcase = null;
        ErrorHandler.logWarning('Option --testcase used without --test is ignored.');
      }
      if (typeof this.argv.group == 'string') {
        testsource = this.findGroupPath(this.argv.group);
      } else {
        testsource = this.settings.src_folders;
      }
    }

    return testsource;
  },

  /**
   * Attempting to prepend the base source folder to the group name;
   * this only works if only one source folder is defined in the src_folders property
   *
   * @param {string} groupName
   * @return {Array}
   */
  findGroupPath : function(groupName) {
    if (this.settings.src_folders.length !== 1) {
      return [groupName];
    }
    var srcFolder = this.settings.src_folders[0], fullPath;
    if (groupName.indexOf(srcFolder) === 0) {
      fullPath = groupName;
    } else {
      fullPath = path.join(srcFolder, groupName);
    }
    return [fullPath];
  },

  /**
   * Starts the selenium server process
   * @param {function} [callback]
   * @returns {CliRunner}
   */
  startSelenium : function(callback) {
    callback = callback || function() {};
    var globalsContext = this.test_settings && this.test_settings.globals || null;
    // adding a link to the test_settings object on the globals context
    if (globalsContext) {
      globalsContext.test_settings = this.test_settings;
    }
    var beforeGlobal = Utils.checkFunction('before', globalsContext) || function(done) {done();};

    if (!this.manageSelenium) {
      beforeGlobal.call(globalsContext, function() {
        callback();
      });
      return this;
    }

    this.settings.parallelMode = this.parallelMode;
    var self = this;

    beforeGlobal.call(globalsContext, function() {
      Selenium.startServer(self.settings, function(error, child, error_out, exitcode) {
        if (error) {
          console.error('There was an error while starting the Selenium server:');
          ErrorHandler.handle({
            message : error_out
          });

          return;
        }
        callback();
      });
    });
    return this;
  },

  /**
   * Stops the selenium server if it is running
   * @returns {CliRunner}
   */
  stopSelenium : function(callback) {
    if (this.manageSelenium) {
      Selenium.stopServer(callback);
    } else {
      callback();
    }
    return this;
  },

  /**
   * Starts the test runner
   *
   * @param {function} [finished] optional callback
   * @returns {CliRunner}
   */
  runTests : function(finished) {
    if (this.parallelMode) {
      return this;
    }

    var source = this.getTestSource();
    var self = this;

    this.startSelenium(function() {
      Runner.run(source, self.test_settings, {
        output_folder : self.output_folder,
        src_folders : self.settings.src_folders,
        live_output : self.settings.live_output,
        start_session: self.startSession,
        reporter : self.argv.reporter,
        testcase : self.argv.testcase,
        end_session_on_fail : self.endSessionOnFail,
        retries : self.argv.retries
      }, function(err, results) {
        self.stopSelenium(function() {
          var globalsContext = self.test_settings && self.test_settings.globals || null;
          var afterGlobal = Utils.checkFunction('after', globalsContext) || function(done) {done();};

          try {
            afterGlobal.call(globalsContext, function done() {
              ErrorHandler.handle(err, results, finished);
            });
          } catch (ex) {
            ErrorHandler.handle(ex, results, finished);
          }
        });
      });
    });

    return this;
  },

  inheritFromDefaultEnv : function() {
    if (this.argv.env == 'default') {
      return;
    }
    var defaultEnv = this.settings.test_settings['default'] || {};
    for (var key in defaultEnv) {
      if (typeof this.test_settings[key] == 'undefined') {
        this.test_settings[key] = defaultEnv[key];
      }
    }
  },

  /**
   * Validates and parses the test settings
   * @param {object} [settings]
   * @param {function} [done]
   * @returns {CliRunner}
   */
  parseTestSettings : function(settings, done) {
    // checking if the env passed is valid
    if (!this.settings.test_settings) {
      throw new Error('No testing environment specified.');
    }

    var envs = this.argv.env.split(',');
    for (var i = 0; i < envs.length; i++) {
      if (!(envs[i] in this.settings.test_settings)) {
        throw new Error('Invalid testing environment specified: ' + envs[i]);
      }
    }

    if (envs.length > 1) {
      this.setupParallelMode(envs, done);
      return this;
    }

    this.initTestSettings(this.argv.env, settings);

    if (this.parallelModeWorkers()) {
      this.setupParallelMode(null, done);
    }

    return this;
  },

  setGlobalOutputOptions: function () {
    this.test_settings.output = this.test_settings.output || (this.settings.output && typeof this.test_settings.output == 'undefined');
    this.test_settings.silent = this.test_settings.silent || typeof this.test_settings.silent == 'undefined';
    if (this.argv.verbose) {
      this.test_settings.silent = false;
    }

    return this;
  },

  /**
   * Sets the specific test settings for the specified environment
   * @param {string} [env]
   * @param {object} [settings]
   * @returns {CliRunner}
   */
  initTestSettings : function(env, settings) {
    // picking the environment specific test settings
    this.test_settings = env && this.settings.test_settings[env] || {};
    if (env) {
      this.test_settings.custom_commands_path = this.settings.custom_commands_path || '';
      this.test_settings.custom_assertions_path = this.settings.custom_assertions_path || '';
      this.test_settings.page_objects_path = this.settings.page_objects_path || '';

      this.inheritFromDefaultEnv();
      this.updateTestSettings(settings || {});
      this.readExternalGlobals();
    }

    this.setGlobalOutputOptions();

    if (typeof this.test_settings.test_workers != 'undefined') {
      this.settings.test_workers = this.test_settings.test_workers;
    }

    if (typeof this.argv.skipgroup == 'string') {
      this.test_settings.skipgroup = this.argv.skipgroup.split(',');
    }

    if (this.argv.filter) {
      this.test_settings.filename_filter = this.argv.filter;
    }

    if (this.argv.tag) {
      this.test_settings.tag_filter = this.argv.tag;
    }

    if (typeof this.argv.skiptags == 'string') {
      this.test_settings.skiptags = this.argv.skiptags.split(',');
    }

    return this;
  },

  /**
   *
   * @param {Object} [test_settings]
   * @returns {CliRunner}
   */
  updateTestSettings : function(test_settings) {
    if (this.parallelMode && !this.parallelModeWorkers()) {
      return this;
    }

    if (test_settings && typeof test_settings == 'object') {
      for (var key in test_settings) {
        this.test_settings[key] = test_settings[key];
      }
    }

    this.settings.selenium = this.settings.selenium || {};

    // overwrite selenium settings per environment
    if (Utils.isObject(this.test_settings.selenium)) {
      for (var prop in this.test_settings.selenium) {
        this.settings.selenium[prop] = this.test_settings.selenium[prop];
      }
    }

    this.manageSelenium = !this.isParallelMode() && this.settings.selenium.start_process || false;
    this.startSession = this.settings.selenium.start_session || typeof this.settings.selenium.start_session == 'undefined';

    this.mergeSeleniumOptions();
    this.disableCliColorsIfNeeded();

    this.endSessionOnFail = typeof this.settings.end_session_on_fail == 'undefined' || this.settings.end_session_on_fail;
    if (typeof this.test_settings.end_session_on_fail != 'undefined') {
      this.endSessionOnFail = this.test_settings.end_session_on_fail;
    }
    return this;
  },

  disableCliColorsIfNeeded : function() {
    if (this.settings.disable_colors || this.test_settings.disable_colors) {
      Logger.disableColors();
    }
    return this;
  },

  /**
   * Backwards compatible method which attempts to merge deprecated driver specific options for selenium
   * @returns {CliRunner}
   */
  mergeSeleniumOptions : function() {
    var self = this;
    if (!this.manageSelenium) {
      return this;
    }
    this.settings.selenium.cli_args = this.settings.selenium.cli_args || {};
    this.mergeCliArgs();

    var deprecationNotice = function(propertyName, newSettingName) {
      ErrorHandler.logWarning('DEPRECATION NOTICE: Property ' + propertyName + ' is deprecated since v0.5. Please' +
        ' use the "cli_args" object on the "selenium" property to define "' + newSettingName + '". E.g.:');
      var demoObj = '{\n' +
        '  "cli_args": {\n' +
        '    "'+ Logger.colors.yellow(newSettingName) +'": "<VALUE>"\n' +
        '  }\n' +
        '}';

      console.log(demoObj, '\n');
    };

    if (this.test_settings.firefox_profile) {
      deprecationNotice('firefox_profile', 'webdriver.firefox.profile');
      this.settings.selenium.cli_args['webdriver.firefox.profile'] = this.test_settings.firefox_profile;
    }
    if (this.test_settings.chrome_driver) {
      deprecationNotice('chrome_driver', 'webdriver.chrome.driver');
      this.settings.selenium.cli_args['webdriver.chrome.driver'] = this.test_settings.chrome_driver;
    }
    if (this.test_settings.ie_driver) {
      deprecationNotice('ie_driver', 'webdriver.ie.driver');
      this.settings.selenium.cli_args['webdriver.ie.driver'] = this.test_settings.ie_driver;
    }

    return this;
  },

  /**
   * Merge current environment specific cli_args into the main cli_args object to be passed to selenium
   *
   * @returns {CliRunner}
   */
  mergeCliArgs : function() {
    if (Utils.isObject(this.test_settings.cli_args)) {
      for (var prop in this.test_settings.cli_args) {
        if (this.test_settings.cli_args.hasOwnProperty(prop)) {
          this.settings.selenium.cli_args[prop] = this.test_settings.cli_args[prop];
        }
      }
    }
    return this;
  },

  ////////////////////////////////////////////////////////////////////////////////////
  // Parallelism related
  ////////////////////////////////////////////////////////////////////////////////////
  isParallelMode : function() {
    return process.env.__NIGHTWATCH_PARALLEL_MODE === '1';
  },

  parallelModeWorkers: function () {
    return !this.isParallelMode() && !this.singleTestRun() && (this.settings.test_workers === true ||
      Utils.isObject(this.settings.test_workers) && this.settings.test_workers.enabled);
  },

  /**
   * Enables parallel execution mode
   * @param {Array} envs
   * @param {function} [done]
   * @returns {CliRunner}
   */
  setupParallelMode : function(envs, done) {
    this.parallelMode = true;
    var self = this;

    this.startSelenium(function() {
      self.startChildProcesses(envs, function(code) {
        self.stopSelenium(function() {
          if (done) {
            done(self.childProcessOutput, code);
          }
          if (code) {
            process.exit(code);
          }
        });
      });
    });

    return this;
  },

  getAvailableColors : function () {
    var availColors = [
      ['red', 'light_gray'],
      ['green', 'black'],
      ['blue', 'light_gray'],
      ['magenta', 'light_gray']
    ];
    var currentIndex = availColors.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      // And swap it with the current element.
      temporaryValue = availColors[currentIndex];
      availColors[currentIndex] = availColors[randomIndex];
      availColors[randomIndex] = temporaryValue;
    }
    return availColors;
  },

  /**
   * Start a new child process for each environment
   * @param {Array} envs
   * @param {function} doneCallback
   */
  startChildProcesses : function(envs, doneCallback) {
    doneCallback = doneCallback || function() {};

    var availColors = this.getAvailableColors();

    this.childProcessOutput = {};
    ChildProcess.prevIndex = 0;

    var args = this.getChildProcessArgs(envs);

    if (envs === null) {
      this.startTestWorkers(availColors, args, doneCallback);
      return this;
    }

    this.startEnvChildren(envs, availColors, args, doneCallback);
  },

  startEnvChildren : function(envs, availColors, args, doneCallback) {
    var self = this;

    envs.forEach(function(environment, index) {
      self.childProcessOutput[environment] = [];
      var childArgs = args.slice();
      childArgs.push('--env', environment);

      var child = new ChildProcess(environment, index, self.childProcessOutput[environment], self.settings, childArgs);
      child.setLabel(environment + ' environment');
      self.runningProcesses[child.itemKey] = child;
      self.runningProcesses[child.itemKey].run(availColors, function(output, exitCode) {
        if (self.processesRunning() === 0) {
          if (!self.settings.live_output) {
            self.printChildProcessOutput();
          }

          doneCallback(exitCode);
        }
      });
    });
  },

  getChildProcessArgs : function(envs) {
    var childProcessArgs = [];
    for (var i = 2; i < process.argv.length; i++) {
      if (envs && (process.argv[i] == '-e' || process.argv[i] == '--env')) {
        i++;
      } else {
        childProcessArgs.push(process.argv[i]);
      }
    }

    return childProcessArgs;
  },

  startTestWorkers : function(availColors, args, doneCallback) {
    var workerCount = this.getTestWorkersCount();
    var source = this.getTestSource();
    var self = this;

    Runner.readPaths(source, this.test_settings, function(error, modulePaths) {
      if (error) {
        ErrorHandler.handle(error, null, doneCallback);
        return;
      }

      var remaining = modulePaths.length;
      Utils.processAsyncQueue(workerCount, modulePaths, function(modulePath, index, next) {
        var filename = path.basename(modulePath, '.js');

        self.childProcessOutput[filename] = [];

        var childArgs = args.slice();
        childArgs.push('--test', modulePath);
        var child = new ChildProcess(filename, index, self.childProcessOutput[filename], self.settings, childArgs);
        child.setLabel(Utils.getModuleKey(modulePath, self.settings.src_folders, modulePaths));
        self.runningProcesses[child.itemKey] = child;
        self.runningProcesses[child.itemKey].run(availColors, function (output, exitCode) {
          remaining -=1;
          if (remaining > 0) {
            next();
          } else {
            if (!self.settings.live_output) {
              self.printChildProcessOutput();
            }

            doneCallback(exitCode);
          }
        });
      });
    });
  },

  printChildProcessOutput : function() {
    var self = this;
    Object.keys(this.childProcessOutput).forEach(function(environment) {
      self.childProcessOutput[environment].forEach(function(output) {
        process.stdout.write(output + '\n');
      });
    });
  },

  getTestWorkersCount : function() {
    var workers = 1;
    if (this.settings.test_workers === true || this.settings.test_workers.workers === 'auto') {
      workers = require('os').cpus().length;
    } else if ('number' === typeof this.settings.test_workers.workers) {
      workers = this.settings.test_workers.workers;
    }

    return workers;
  },

  processesRunning : function() {
    var running = 0;
    for (var item in this.runningProcesses) {
      if (this.runningProcesses.hasOwnProperty(item) && this.runningProcesses[item].processRunning) {
        running += 1;
      }
    }
    return running;
  }
};

module.exports = CliRunner;
