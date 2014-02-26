var fs = require('fs');
var path = require('path');
var util = require('util');
var events = require('events');
var Logger = require('../logger.js');
var Protocol = require('./protocol.js');

module.exports = function(context) {
  var returnValue = {};
  var elementCommands = {};

  /**
   * Simulates a click event on the given DOM element. Uses elementIdClick protocol command.
   *
   * ```
   *    this.demoTest = function (client) {
   *      client.click("#main ul li a.first");
   *    };
   * ```
   *
   * @method click
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdClick
   * @api commands
   */
  elementCommands.click = 'elementIdClick';

  /**
   * Clear a textarea or a text input element's value. Uses elementIdValue protocol command.
   *
   * ```
   *    this.demoTest = function (client) {
   *      client.clearValue('input[type=text]');
   *    };
   * ```
   *
   * @method clearValue
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdClear
   * @api commands
   */
  elementCommands.clearValue = 'elementIdClear';

  /**
   * Retrieve the value of an attribute for a given DOM element. Uses elementIdAttribute protocol command.
   *
   * ```
   *    this.demoTest = function (client) {
   *
   *      client.getAttribute("#main ul li a.first", "href", function(result) {
   *        this.assert.equal(typeof result, "object");
   *        this.assert.equal(result.status, 0);
   *        this.assert.equal(result.value, 'http://nightwatchjs.org');
   *      });
   *
   *    };
   * ```
   *
   * @method getAttribute
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {string} atttribute The attribute name to inspect.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdAttribute
   * @return {*} The value of the attribute
   * @api commands
   */
  elementCommands.getAttribute = ['elementIdAttribute', 1];

  /**
   * Retrieve the value of a css property for a given DOM element. Uses elementIdCssProperty protocol command.
   *
   * ```
   *    this.demoTest = function (client) {
   *
   *      client.getCssProperty("#main ul li a.first", "display", function(result) {
   *        this.assert.equal(typeof result, "object");
   *        this.assert.equal(result.status, 0);
   *        this.assert.equal(result.value, 'inline');
   *      });
   *
   *    };
   * ```
   *
   * @method getCssProperty
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {string} cssProperty The CSS property to inspect.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdCssProperty
   * @return {*} value|The value of the css property
   * @api commands
   */
  elementCommands.getCssProperty = ['elementIdCssProperty', 1];

  /**
   * Determine an element's size in pixels. Uses elementIdSize protocol command.
   *
   * ```
   *    this.demoTest = function (client) {
   *
   *      client.getElementSize("#main ul li a.first", function(result) {
   *        this.assert.equal(typeof result, "object");
   *        this.assert.equal(result.status, 0);
   *        this.assert.equal(result.value.width, 500);
   *        this.assert.equal(result.value.height, 20);
   *      });
   *
   *    };
   * ```
   *
   * @method getElementSize
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdSize
   * @return {number} value.width|The width of the element in pixels
   * @return {number} value.height|The height of the element in pixels
   * @api commands
   */
  elementCommands.getElementSize = 'elementIdSize';

  /**
   * Determine an element's location on the page. The point (0, 0) refers to the upper-left corner of the page.
   * The element's coordinates are returned as a JSON object with x and y properties. Uses elementIdLocation protocol command.
   *
   * ```
   *    this.demoTest = function (client) {
   *
   *      client.getLocation("#main ul li a.first", function(result) {
   *        this.assert.equal(typeof result, "object");
   *        this.assert.equal(result.status, 0);
   *        this.assert.equal(result.value.x, 200);
   *        this.assert.equal(result.value.y, 200);
   *      });
   *
   *    };
   * ```
   *
   * @method getLocation
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdLocation
   * @return {number} value.x|The X coordinate for the element on the page.
   * @return {number} value.y|The Y coordinate for the element on the page.
   * @api commands
   */
  elementCommands.getLocation = 'elementIdLocation';

  /**
   * Determine an element's location on the screen once it has been scrolled into view. Uses elementIdLocationInView protocol command.
   *
   * ```
   *    this.demoTest = function (browser) {
   *
   *      browser.getLocationInView("#main ul li a.first", function(result) {
   *        this.assert.equal(typeof result, "object");
   *        this.assert.equal(result.status, 0);
   *        this.assert.equal(result.value.x, 200);
   *        this.assert.equal(result.value.y, 200);
   *      });
   *
   *    };
   * ```
   *
   * @method getLocationInView
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdLocationInView
   * @return {number} value.x|The X coordinate for the element on the page.
   * @return {number} value.y|The Y coordinate for the element on the page.
   * @api commands
   */
  elementCommands.getLocationInView = 'elementIdLocationInView';

  /**
   * Query for an element's tag name. Uses elementIdName protocol command.
   *
   * ```
   *    this.demoTest = function (client) {
   *
   *      client.getTagName("#main ul li .first", function(result) {
   *        this.assert.equal(typeof result, "object");
   *        this.assert.equal(result.status, 0);
   *        this.assert.equal(result.value, "a");
   *      });
   *
   *    };
   * ```
   *
   * @method getTagName
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdName
   * @return {number} value|The element's tag name, as a lowercase string.
   * @api commands
   */
  elementCommands.getTagName = 'elementIdName';

  /**
   * Returns the visible text for the element. Uses elementIdText protocol command.
   *
   * ```
   *    this.demoTest = function (browser) {
   *      browser.getText("#main ul li a.first", function(result) {
   *        this.assert.equal(typeof result, "object");
   *        this.assert.equal(result.status, 0);
   *        this.assert.equal(result.value, "nightwatchjs.org");
   *      });
   *    };
   * ```
   *
   * @method getText
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdText
   * @return {string} value|The element's visible text.
   * @api commands
   */
  elementCommands.getText = 'elementIdText';

  /**
   * Returns a form element current value. Uses elementIdValue protocol command.
   *
   * ```
   *    this.demoTest = function (browser) {
   *      browser.getValue("form.login input[type=text]", function(result) {
   *        this.assert.equal(typeof result, "object");
   *        this.assert.equal(result.status, 0);
   *        this.assert.equal(result.value, "enter username");
   *      });
   *    };
   * ```
   *
   * @method getValue
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdValue
   * @return {string} value|The element's value.
   * @api commands
   */
  elementCommands.getValue = 'elementIdValue';

  /**
   * Determine if an element is currently displayed. Uses elementIdDisplayed protocol command.
   *
   * ```
   *    this.demoTest = function (browser) {
   *      browser.isVisible('#main', function(result) {
   *        this.assert.equal(typeof result, "object");
   *        this.assert.equal(result.status, 0);
   *        this.assert.equal(result.value, true);
   *      });
   *    };
   * ```
   *
   * @method isVisible
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdDisplayed
   * @api commands
   */
  elementCommands.isVisible = 'elementIdDisplayed';

  /**
   * Move the mouse by an offset of the specified element. Uses moveTo protocol command.
   *
   * ```
   *    this.demoTest = function (browser) {
   *      browser.moveToElement('#main', 10, 10);
   *    };
   * ```
   *
   * @method moveToElement
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {number} xoffset X offset to move to, relative to the top-left corner of the element.
   * @param {number} yoffset Y offset to move to, relative to the top-left corner of the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.moveTo
   * @api commands
   */
  elementCommands.moveToElement = ['moveTo', 2];

  /**
   * Sends some text to an element. Can be used to set the value of a form element. Uses elementIdValue protocol command.
   *
   * ```
   *    this.demoTest = function (browser) {
   *      browser.setValue('input[type=text]', 'nightwatch');
   *    };
   * ```
   *
   * @method setValue
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {string} value The text to send to the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.elementIdValue
   * @api commands
   */
  elementCommands.setValue = ['elementIdValue', 1];

  /**
   * Submit a FORM element. The submit command may also be applied to any element that is a descendant of a FORM element. Uses submit protocol command.
   *
   * ```
   *    this.demoTest = function (browser) {
   *      browser.submitForm('form.login');
   *    };
   * ```
   *
   * @method submitForm
   * @param {string} cssSelector The CSS selector used to locate the element.
   * @param {function} [callback] Optional callback function to be called when the command finishes.
   * @see protocol.submit
   * @api commands
   */
  elementCommands.submitForm = 'submit';

  function addElementCommand(protocolAction, extraArgs) {
    var defaultUsing = 'css selector';
    var self = this;
    extraArgs = extraArgs || 0;
    var expectedArgs = 3 + extraArgs;
    return function() {
      var noopFn = function() {};
      var args  = Array.prototype.slice.call(arguments, 0);
      if (typeof args[args.length-1] !== 'function') {
        args.push(noopFn);
      }

      if (expectedArgs - args.length === 1) {
        args.unshift(defaultUsing);
      }

      if (args.length < expectedArgs - 1 || args.length > expectedArgs) {
        throw new Error(protocolAction + ' method expects ' + (expectedArgs - 1) + ' or ' + expectedArgs + ' arguments - ' + args.length + ' given.');
      }

      var using = args.shift(), value = args.shift();
      var callback = args.pop();

      function CommandAction() {
        events.EventEmitter.call(this);

        var $this = this;

        var el = Protocol.actions.element.call(self, using, value, function(result) {
          if (result.status !== 0) {
            callback.call(self, result);
            var errorMessage = 'Unable to locate element: "' + value + '" using: ' + using;
            self.results.errors++;
            self.errors.push(errorMessage);
            console.log(Logger.colors.red("ERROR:"), errorMessage);
            $this.emit('complete', el, $this);
          } else {
            result = result.value.ELEMENT;

            args.push(function(r) {
              callback.call(self, r);
            });

            args.unshift(result);

            var c = Protocol.actions[protocolAction].apply(self, args).once('complete', function() {
              $this.emit('complete', c, $this);
            });
          }
        });
      }

      util.inherits(CommandAction, events.EventEmitter);

      return new CommandAction();
    };
  }

  for (var commandName in elementCommands) {
    var args = elementCommands[commandName];
    if (!Array.isArray(args)) {
      args = [args];
    }

    returnValue[commandName] = addElementCommand.apply(context, args);
  }

  return returnValue;
};