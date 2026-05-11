import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PrimengSmokeComponent } from './primeng-smoke.component';

const routes: Routes = [{ path: '', component: PrimengSmokeComponent }];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class PrimengSmokeRoutingModule {}
