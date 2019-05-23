export default {
  entry: 'src/yom-file-uploader.js',
  format: 'umd',
  moduleName: 'YomFileUploader',
  external: ['jquery', 'exif-js'],
  globals: {
    jquery: '$',
    'exif-js': 'EXIF'
  },
  dest: 'dist/yom-file-uploader.js'
};