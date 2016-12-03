var path = require('path');
var tape = require('tape');
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var util = proxyquire('../module/util.js', {
    './common.js': {
        getCwd: () => {
            return path.join(__dirname, '/testcase/project1');
        }
    }
});

tape('hasAMD', test => {
    test.ok(util.hasAMD({}));
    test.end();
});
