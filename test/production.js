var should = require('should');
var debug = require('debug')('febu:' + __filename);
var replace = require('frep');
var fs = require('fs');
var path = require('path');
var common = require('../module/common.js');
var db = require('../module/db.js');
var P = require('../module/production.js');
var Git = require('../module/git.js');

describe(__filename, function(){
	var project = {
		repo: 'http://github.com/holyzfy/test_repo_url',
		development: {
			web: '//qa.developer.test.com/'
		},
		production: {
			web: '//img1.cache.test.com/f2e/'
		}
	};
	
	var p = new P(project);

	before(function(done){
		p.db = db;
		db.open(done);
	});

	it('exist', function(done) {
		p.exist('_a_commit_id', function(err, data) {
			data.should.be.false;
			done();
		});
	});

	it('getFilePath', function(done) {
		// TODO
		done();
	});

	it('compileStaticFiles', function(done) {
		// TODO
		done();
	});

	it('compileVmFiles', function(done) {
		// TODO
		done();
	});

});