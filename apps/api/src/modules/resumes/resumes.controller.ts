import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../../common/auth';
import { ResumesService } from './resumes.service';
import { MAX_RESUME_BYTES } from './text-extractor';

@ApiTags('resumes')
@ApiBearerAuth()
@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumes: ResumesService) {}

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RESUME_BYTES } }))
  upload(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.resumes.upload(u.id, file);
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.resumes.list(u.id);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.resumes.get(u.id, id);
  }

  @Get(':id/download')
  download(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.resumes.downloadUrl(u.id, id);
  }

  @Post(':id/activate')
  activate(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.resumes.setActive(u.id, id);
  }

  @Post(':id/reparse')
  reparse(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.resumes.reparse(u.id, id);
  }

  @HttpCode(204)
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.resumes.remove(u.id, id);
  }
}
