# Photo Prestige - Cloud Services

Korte project README met snelle links naar documentatie en testtools.

## Snelle links

- Gateway Swagger UI: http://localhost:3000/docs
- Gateway OpenAPI JSON: http://localhost:3000/openapi.json
- Gateway health: http://localhost:3000/health
- RabbitMQ Management: http://localhost:15672 (guest / guest)

## Repository documentatie

- E2E Postman collectie: [documentation/postman/photo-prestige-e2e.postman_collection.json](documentation/postman/photo-prestige-e2e.postman_collection.json)
- Image storage toelichting: [documentation/IMAGE_STORAGE_STRATEGY.md](documentation/IMAGE_STORAGE_STRATEGY.md)
- Target service docs: [target-service/README.md](target-service/README.md)
- Score service docs: [score-service/README.md](score-service/README.md)

## Services & poorten

- API Gateway: `3000`
- Auth Service: `3001`
- Target Service: `3002`
- Register Service: `3003`
- Score Service: `3004`
- Mail Service: `3005`
- Clock Service: `3006`
- MongoDB: `27017`
- RabbitMQ: `5672` (AMQP), `15672` (UI)

## Snel starten

Project draait via Docker Compose vanaf de repository root.

Belangrijk voor beoordeling:
- Swagger docs staan op de gateway (`/docs`)
- Async events lopen via RabbitMQ
- End-to-end requests lopen via de API Gateway
