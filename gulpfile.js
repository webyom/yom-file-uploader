var gulp = require('gulp');
var bundler = require('gulp-amd-bundler');

gulp.task('bundle', function() {
	gulp.src(['src/yom-file-uploader.js'])
		.pipe(bundler({
			beautifyTemplate: true
		}))
		.pipe(gulp.dest('dist'));
});

gulp.task('default', ['bundle']);