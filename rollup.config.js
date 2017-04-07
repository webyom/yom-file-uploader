export default {
  entry: 'src/yom-file-uploader.js',
  format: 'umd',
  moduleName: 'YomFileUploader',
  external: ['jquery'],
  globals: {jquery: '$'},
  dest: 'dist/yom-file-uploader.js'
};