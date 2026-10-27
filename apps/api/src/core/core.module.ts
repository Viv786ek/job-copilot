import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/config.service';
import { CacheService } from './cache.service';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [AppConfig, PrismaService, CacheService, StorageService],
  exports: [AppConfig, PrismaService, CacheService, StorageService],
})
export class CoreModule {}
