var path = require('path');
var expect = require('expect.js');
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var util = proxyquire('../module/util.js', {
    common: (function() {
        var common = require('../module/common.js');
        common.getCwd = sinon.stub().returns(path.join(__dirname, 'testcase/project1'));
        return common;
    })()
});

describe(__filename, function(){
    it('hasAMD', function(done) {
        var project = {};
        util.hasAMD(project, function(err, exist){
            expect(exist).to.be.ok();
            done(err);
        });
    });

});