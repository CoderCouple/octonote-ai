import { Module } from "@nestjs/common";
import { MeController } from "../api/v1/controller/me.controller";
import { AccountService } from "../service/account.service";
import { MeService } from "../service/me.service";

@Module({
  controllers: [MeController],
  providers: [MeService, AccountService],
})
export class MeModule {}
