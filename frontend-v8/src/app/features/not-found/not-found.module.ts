import { NgModule } from '@angular/core';
import { SharedModule } from 'src/app/shared/shared.module';
import { NotFoundRoutingModule } from './not-found-routing.module';
import { NotFoundComponent } from './not-found.component';

@NgModule({
  imports: [SharedModule, NotFoundRoutingModule],
  declarations: [NotFoundComponent],
})
export class NotFoundModule {}
