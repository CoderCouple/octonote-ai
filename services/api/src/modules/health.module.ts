import { Module } from "@nestjs/common";
import { HealthController } from "../api/v1/controller/health.controller";

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
