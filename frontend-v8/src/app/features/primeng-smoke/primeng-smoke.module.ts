import { NgModule } from '@angular/core';
import { SharedModule } from 'src/app/shared/shared.module';
import { PrimengSmokeRoutingModule } from './primeng-smoke-routing.module';
import { PrimengSmokeComponent } from './primeng-smoke.component';

@NgModule({
  imports: [SharedModule, PrimengSmokeRoutingModule],
  declarations: [PrimengSmokeComponent],
})
export class PrimengSmokeModule {}
