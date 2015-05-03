var should = require('should');
var debug = require('debug')('febu:' + __filename);
var db = require('../module/db.js');
var Dev = require('../module/development.js');

describe(__filename, function(){
	var project = {
		repo: 'http://github.com/holyzfy/test_repo_url',
		development: {
			ftp: '',
			web: '//qa.developer.test.com/'
		},
		production: {
			ftp: '',
			web: '//img1.cache.test.com/f2e/'
		},
		version: '3bc6453'
	};
	
	var dev = new Dev(project);

	before(function(done){
		dev.db = db;
		db.init(done);
	});

	it('exist', function(done) {
		dev.exist('_a_commit_id', function(err, data) {
			data.should.be.false;
			done();
		});
	});
});