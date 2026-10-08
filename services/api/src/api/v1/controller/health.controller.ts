import { Controller, Get } from "@nestjs/common";
import type { HealthDto } from "../response/health.response";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthDto {
    return {
      ok: true,
      service: "octonoteai-api",
      timestamp: new Date().toISOString(),
    };
  }
}
