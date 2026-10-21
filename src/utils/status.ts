export default {
  OK: { statusCode: 200 },
  CREATED: { statusCode: 201 },
  NO_CONTENT: { statusCode: 204, body: '' },
  BAD_REQUEST: { statusCode: 400, body: '{"message":"Bad request"}' },
  FORBIDDEN: { statusCode: 403 },
  NOT_FOUND: { statusCode: 404, body: '{"message":"Not found"}' },
  TOO_MANY_REQUESTS: { statusCode: 429, body: '{"message":"Too many requests"}' },
  INTERNAL_SERVER_ERROR: { statusCode: 500, body: '{"message":"Internal server error"}' },
  SERVICE_UNAVAILABLE: { statusCode: 503, body: '{"message":"Service unavailable"}' },
}
