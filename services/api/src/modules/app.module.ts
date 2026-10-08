import { Module } from "@nestjs/common";
import { CoreModule } from "./core.module";
import { FeaturesModule } from "./features.module";
import { HealthModule } from "./health.module";
import { MeModule } from "./me.module";
import { PreferencesModule } from "./preferences.module";

@Module({
  imports: [CoreModule, HealthModule, MeModule, PreferencesModule, FeaturesModule],
})
export class AppModule {}
