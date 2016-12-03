var path = require('path');
var tape = require('tape');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var util = proxyquire('../module/util.js', {
    './common.js': {
        getCwd: () => {
            return path.join(__dirname, '/testcase/project1');
        }
    }
});

var project = {};
tape('getProjectConfig', test => {
    var devPublicPath = util.getProjectConfig(project, 'development.publicPath');
    test.equal(devPublicPath, '//static.f2e.example.com/assets/myproject');        
    test.end();
});

tape('getProjectConfig2', test => {
    var ignore = util.getProjectConfig(project, 'ignore');
    test.deepEqual(ignore, ['node_modules/']);
    test.end();
});

tape('getProjectPublicPath', test => {
    var publicPath = 'http://static.example.com/project';
    util.getProjectConfig = sinon.stub().returns(publicPath);
    var ret = util.getProjectPublicPath({}, 'development');
    test.equal(ret, publicPath + '/');
    test.end();
});

tape('getProjectPublicPath2', test => {
    var publicPath = 'http://static.example.com/project/';
    util.getProjectConfig = sinon.stub().returns(publicPath);
    var ret = util.getProjectPublicPath({}, 'development');
    test.equal(ret, publicPath);
    test.end();
});
