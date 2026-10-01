import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('ProcessService (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Tests are meant to be executed when docker-compose is running
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('/rules (POST) - Create a rule', async () => {
    const res = await request(app.getHttpServer())
      .post('/rules')
      .send({
        name: 'High Temp Sensor',
        conditions: [{ field: 'value', operator: 'GT', value: 80 }],
        isActive: true,
      })
      .expect(201);
    
    expect(res.body._id).toBeDefined();
    expect(res.body.name).toBe('High Temp Sensor');
  });

  it('/reports/leaderboard/:ruleId (GET) - Empty leaderboard initially', async () => {
    const rules = await request(app.getHttpServer()).get('/rules').expect(200);
    const ruleId = rules.body.data[0]._id;

    const res = await request(app.getHttpServer())
      .get(`/reports/leaderboard/${ruleId}`)
      .expect(200);
    
    expect(res.body).toEqual([]);
  });
});
