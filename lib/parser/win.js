'use strict';

var util = require('util');
var __ = require('underscore');

var base = require('./base');

/**
 * @constructor
 */
function WinParser() {
    base.call(this);
    this._ipv4Regex = /^([0-9]{1,3}\.){3}[0-9]{1,3}$/;
}

util.inherits(WinParser, base);

/**
 * Process output's header
 * @param {string} line - A line from system ping
 */
WinParser.prototype._processHeader = function (line) {
    // XXX: Expect to find [****] when pinging domain like google.com
    //      Read fixture/win/**/* for the detail
    var isPingNumeric = line.indexOf('[') === -1;

    // Get host and numeric_host
    var tokens = line.split(' ');

    if (isPingNumeric) {
        // For those missing [***], get the first token which match IPV4 regex
        this._response.host = __.find(tokens, function (t) {
            return this._ipv4Regex.test(t);
        }, this);
        this._response.numeric_host = this._response.host;
    } else {
        // For those has [***], anchor with such token
        var numericHost = __.find(tokens, function (t) {
            return t.indexOf('[') !== -1;
        }, this);
        var numericHostIndex = tokens.indexOf(numericHost);
        var match = /\[(.*)\]/.exec(numericHost);

        if (match) {
            // Capture IP inside [] only. refs #71
            this._response.numeric_host = match[1];
        } else {
            // Otherwise, just mark as NA to indicate an error
            this._response.numeric_host = 'NA';
        }
        this._response.host = tokens[numericHostIndex - 1];
    }

    this._changeState(this.STATES.BODY);
};

/**
 * Process output's body
 * @param {string} line - A line from system ping
 */
WinParser.prototype._processBody = function (line) {
    var tokens = line.split(' ');
    var kvps = __.filter(tokens, function (token) {
        // Sometime it shows <1ms
        return token.indexOf('=') >= 0 || token.indexOf('<') >= 0;
    });

    // refs #65: Support system like french which has an extra space
    kvps = __.map(kvps, function (kvp) {
        var ret = kvp;
        var kvpIndex = tokens.indexOf(kvp);
        var nextIndex = kvpIndex + 1;

        // Append the missing *ms*
        if (nextIndex < tokens.length) {
            if (tokens[nextIndex] === 'ms') {
                ret += 'ms';
            }
        }

        return ret;
    });

    // kvps.length >= 3 means target is pingable
    if (kvps.length >= 3) {
        // XXX: Assume time will alaways get keyword ms for all language
        var timeKVP = __.find(kvps, function (kvp) {
            return kvp.search(/(ms|мс)/i) >= 0;
        });
        var regExp = /([0-9.]+)/;
        var match = regExp.exec(timeKVP);

        this._times.push(parseFloat(match[1], 10));
    }

    // Change state if it see a ':' at the end
    if (line.slice(-1) === ':') {
        this._changeState(this.STATES.FOOTER);
    }
};

/**
 * Process output's footer
 * @param {string} line - A line from system ping
 */
WinParser.prototype._processFooter = function (line) {
    // XXX: Assume there is a keyword ms
    if (line.search(/(ms|мсек)/i) >= 0) {
        // XXX: Assume the ordering is Min Max Avg
        var regExp = /([0-9.]+)/g;
        var m1 = regExp.exec(line);
        var m2 = regExp.exec(line);
        var m3 = regExp.exec(line);

        if (__.all([m1, m2, m3])) {
            this._response.min = parseFloat(m1[1], 10);
            this._response.max = parseFloat(m2[1], 10);
            this._response.avg = parseFloat(m3[1], 10);
            this._changeState(this.STATES.END);
        }
    }
};

module.exports = WinParser;
