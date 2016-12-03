var fs = require('fs-extra');
var path = require('path');
var tape = require('tape');
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var util = proxyquire('../module/util.js', {
    './git.js': function () {
        this.clone = sinon.stub().callsArg(0);
        this.checkout = sinon.stub().callsArg(1);
        this.fetch = sinon.stub().callsArg(1);
    }
});

tape('getProject', test => {
    var project = {
        repo: 'https://test.com/user/project'
    };
    var commit = 'HEAD';
    util.getProject(project, commit, test.end);
});
