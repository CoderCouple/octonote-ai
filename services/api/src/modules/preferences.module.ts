import { Module } from "@nestjs/common";
import { PreferencesController } from "../api/v1/controller/preferences.controller";
import { PreferencesService } from "../service/preferences.service";

@Module({
  controllers: [PreferencesController],
  providers: [PreferencesService],
})
export class PreferencesModule {}
