export class HealthController {
  constructor() {
    this.startedAt = Date.now();
    this.check = this.check.bind(this);
  }

  check(_req, res) {
    res.json({
      status: 'ok',
      service: 'atlo-backend',
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
    });
  }
}
