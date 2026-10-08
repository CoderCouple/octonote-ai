import { Module } from "@nestjs/common";
import { MeController } from "../api/v1/controller/me.controller";
import { MeService } from "../service/me.service";

@Module({
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
