var path = require('path');
var expect = require('expect.js');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var util = proxyquire('../module/util.js', {
    './common.js': {
        getCwd: () => {
            return path.join(__dirname, '/testcase/project1');
        }
    }
});

describe(__filename, () => {
    var project = {};
    it('getProjectConfig', () => {
        var devPublicPath = util.getProjectConfig(project, 'development.publicPath');
        expect(devPublicPath).to.be("//static.f2e.example.com/assets/myproject");        
    });

    it('getProjectConfig2', () => {
        var ignore = util.getProjectConfig(project, 'ignore');
        expect(ignore).to.eql(['node_modules/']);
    });

    it('getProjectPublicPath', () => {
        var publicPath = 'http://static.example.com/project';
        util.getProjectConfig = sinon.stub().returns(publicPath);
        var ret = util.getProjectPublicPath({}, 'development');
        expect(ret).to.be(publicPath + '/');
    });

    it('getProjectPublicPath2', () => {
        var publicPath = 'http://static.example.com/project/';
        util.getProjectConfig = sinon.stub().returns(publicPath);
        var ret = util.getProjectPublicPath({}, 'development');
        expect(ret).to.be(publicPath);
    });
});