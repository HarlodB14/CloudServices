function createGatewayOpenApiSpec() {
    const serverUrl = process.env.GATEWAY_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;

    return {
        openapi: '3.0.3',
        info: {
            title: 'Photo Prestige API Gateway',
            version: '1.0.0',
            description: 'Gateway-level API documentation for client-facing endpoints. Downstream microservices are proxied through this gateway.'
        },
        servers: [{ url: serverUrl }],
        tags: [
            { name: 'Health' },
            { name: 'Auth' },
            { name: 'Targets' },
            { name: 'Uploads' },
            { name: 'Scores' },
            { name: 'Register' },
            { name: 'Media' }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            },
            parameters: {
                targetId: {
                    name: 'id',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                },
                targetIdRegister: {
                    name: 'targetId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                },
                submissionId: {
                    name: 'submissionId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                }
            },
            responses: {
                Unauthorized: {
                    description: 'Missing or invalid JWT'
                },
                Forbidden: {
                    description: 'Authenticated but insufficient permissions'
                }
            }
        },
        paths: {
            '/health': {
                get: {
                    tags: ['Health'],
                    summary: 'Gateway health check',
                    responses: {
                        200: { description: 'Gateway is healthy' }
                    }
                }
            },
            '/auth/{proxyPath}': {
                parameters: [{
                    name: 'proxyPath',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                    description: 'Dynamic auth-service path (proxy route)'
                }],
                get: {
                    tags: ['Auth'],
                    summary: 'Proxy GET to auth-service',
                    responses: { 200: { description: 'Proxied response' } }
                },
                post: {
                    tags: ['Auth'],
                    summary: 'Proxy POST to auth-service',
                    responses: { 200: { description: 'Proxied response' } }
                }
            },
            '/media/{assetPath}': {
                parameters: [{
                    name: 'assetPath',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                    description: 'Media asset path served by target-service'
                }],
                get: {
                    tags: ['Media'],
                    summary: 'Proxy media asset stream',
                    responses: {
                        200: { description: 'Media stream' },
                        404: { description: 'Asset not found' }
                    }
                }
            },
            '/api/targets': {
                get: {
                    tags: ['Targets'],
                    summary: 'List targets (public)',
                    responses: {
                        200: { description: 'Target list' }
                    }
                },
                post: {
                    tags: ['Targets'],
                    summary: 'Create target (owner only)',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        201: { description: 'Target created' },
                        401: { $ref: '#/components/responses/Unauthorized' },
                        403: { $ref: '#/components/responses/Forbidden' }
                    }
                }
            },
            '/api/targets/{id}': {
                parameters: [{ $ref: '#/components/parameters/targetId' }],
                get: {
                    tags: ['Targets'],
                    summary: 'Get target by id (public)',
                    responses: { 200: { description: 'Target details' } }
                },
                put: {
                    tags: ['Targets'],
                    summary: 'Update target (owner only)',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        200: { description: 'Target updated' },
                        401: { $ref: '#/components/responses/Unauthorized' },
                        403: { $ref: '#/components/responses/Forbidden' }
                    }
                },
                delete: {
                    tags: ['Targets'],
                    summary: 'Delete target (owner only)',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        204: { description: 'Target deleted' },
                        401: { $ref: '#/components/responses/Unauthorized' },
                        403: { $ref: '#/components/responses/Forbidden' }
                    }
                }
            },
            '/api/uploads': {
                post: {
                    tags: ['Uploads'],
                    summary: 'Upload image URL/file reference for submission workflow',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        201: { description: 'Upload accepted' },
                        401: { $ref: '#/components/responses/Unauthorized' },
                        403: { $ref: '#/components/responses/Forbidden' }
                    }
                }
            },
            '/api/targets/{id}/submit': {
                parameters: [{ $ref: '#/components/parameters/targetId' }],
                post: {
                    tags: ['Targets'],
                    summary: 'Submit participant photo for target',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        201: { description: 'Submission processed' },
                        401: { $ref: '#/components/responses/Unauthorized' },
                        403: { $ref: '#/components/responses/Forbidden' }
                    }
                }
            },
            '/api/targets/{id}/my-submission': {
                parameters: [{ $ref: '#/components/parameters/targetId' }],
                get: {
                    tags: ['Targets'],
                    summary: 'View own submission',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Own submission details' } }
                },
                delete: {
                    tags: ['Targets'],
                    summary: 'Delete own submission',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Own submission deleted' } }
                }
            },
            '/api/targets/{id}/rate': {
                parameters: [{ $ref: '#/components/parameters/targetId' }],
                post: {
                    tags: ['Targets'],
                    summary: 'Rate target (thumbs up/down)',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Rating stored' } }
                }
            },
            '/api/targets/{id}/scores': {
                parameters: [{ $ref: '#/components/parameters/targetId' }],
                get: {
                    tags: ['Targets'],
                    summary: 'List participant scores for owned target',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Scores list' } }
                }
            },
            '/api/targets/{id}/finalize': {
                parameters: [{ $ref: '#/components/parameters/targetId' }],
                post: {
                    tags: ['Targets'],
                    summary: 'Finalize target after deadline',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Target finalized' } }
                }
            },
            '/api/targets/{id}/submissions/{submissionId}': {
                parameters: [
                    { $ref: '#/components/parameters/targetId' },
                    { $ref: '#/components/parameters/submissionId' }
                ],
                delete: {
                    tags: ['Targets'],
                    summary: 'Owner deletes participant submission',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Submission removed' } }
                }
            },
            '/api/scores/targets/{targetId}/leaderboard': {
                parameters: [{ $ref: '#/components/parameters/targetIdRegister' }],
                get: {
                    tags: ['Scores'],
                    summary: 'Leaderboard for a target',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Leaderboard data' } }
                }
            },
            '/api/register/{targetId}': {
                parameters: [{ $ref: '#/components/parameters/targetIdRegister' }],
                post: {
                    tags: ['Register'],
                    summary: 'Enroll current participant in target',
                    security: [{ bearerAuth: [] }],
                    responses: { 201: { description: 'Enrolled' } }
                },
                delete: {
                    tags: ['Register'],
                    summary: 'Withdraw current participant from target',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Withdrawn' } }
                }
            },
            '/api/register/{targetId}/my-enrollment': {
                parameters: [{ $ref: '#/components/parameters/targetIdRegister' }],
                get: {
                    tags: ['Register'],
                    summary: 'Get current user enrollment for target',
                    security: [{ bearerAuth: [] }],
                    responses: { 200: { description: 'Enrollment status' } }
                }
            }
        }
    };
}

module.exports = createGatewayOpenApiSpec();