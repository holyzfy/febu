var path = require('path');
var expect = require('expect.js');
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var util = proxyquire('../module/util.js', {
    './common.js': {
        getCwd: () => {
            return path.join(__dirname, '/testcase/project1');
        }
    }
});

describe(__filename, function(){
    it('hasAMD', () => {
        expect(util.hasAMD({})).to.be.ok();
    });
});