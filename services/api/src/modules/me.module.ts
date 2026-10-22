import { Module } from "@nestjs/common";
import { MeController } from "../api/v1/controller/me.controller";
import { AccountService } from "../service/account.service";
import { MeService } from "../service/me.service";
import { FeaturesModule } from "./features.module";

@Module({
  imports: [FeaturesModule],
  controllers: [MeController],
  providers: [MeService, AccountService],
})
export class MeModule {}
