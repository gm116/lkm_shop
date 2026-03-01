const {createProxyMiddleware} = require('http-proxy-middleware');

const target =
  process.env.BACKEND_PROXY_TARGET ||
  process.env.REACT_APP_BACKEND_URL ||
  'http://127.0.0.1:8080';

module.exports = function setupProxy(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })
  );
};
