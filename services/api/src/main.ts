import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppExceptionFilter } from "./common/error/app-exception.filter";
import { ResponseInterceptor } from "./common/interceptor/response.interceptor";
import { AppModule } from "./modules/app.module";

try {
  process.loadEnvFile("../../.env");
} catch {
  // running in an environment where env vars are already set (prod, CI)
}

async function bootstrap() {
  // Autosave sends the whole note/canvas document as JSON; Fastify's 1MB
  // default is too small for large tldraw snapshots.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 10 * 1024 * 1024 }),
  );

  // Comma-separated, e.g. "http://localhost:3000,http://192.168.1.20:3000" for phone testing.
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalFilters(new AppExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = Number(process.env.PORT ?? 4000);
  // Railway/Docker/most prod hosts inject PORT and need 0.0.0.0 to be reachable.
  // Locally we default to loopback for safety.
  const defaultHost = process.env.PORT ? "0.0.0.0" : "127.0.0.1";
  const host = process.env.HOST ?? defaultHost;
  await app.listen(port, host);
}

void bootstrap();

// touch 1782012056
// touch 1783034404
