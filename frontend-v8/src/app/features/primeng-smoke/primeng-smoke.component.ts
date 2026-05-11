import { Component } from '@angular/core';

interface DropdownOption { label: string; value: string; }
interface BarDatum { label: string; value: number; }

@Component({
  selector: 'app-primeng-smoke',
  templateUrl: './primeng-smoke.component.html',
  styleUrls: ['./primeng-smoke.component.scss'],
})
export class PrimengSmokeComponent {
  dropdownOptions: DropdownOption[] = [
    { label: 'DEL', value: 'DEL' },
    { label: 'BOM', value: 'BOM' },
    { label: 'HYD', value: 'HYD' },
  ];
  dropdownValue: string | null = null;
  multiValue: string[] = [];
  checkboxValue = false;
  switchValue = false;
  inputValue = '';
  date: Date | null = null;
  showDialog = false;
  barData: BarDatum[] = [
    { label: 'A', value: 12 },
    { label: 'B', value: 25 },
    { label: 'C', value: 8 },
    { label: 'D', value: 33 },
  ];
}
