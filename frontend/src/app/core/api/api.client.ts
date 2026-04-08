import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  get<T>(path: string, queryParams?: Record<string, string | undefined>): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${path}`, {
      params: this.buildParams(queryParams),
      withCredentials: true,
    });
  }

  post<T>(path: string, body: unknown = {}, queryParams?: Record<string, string | undefined>): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body, {
      params: this.buildParams(queryParams),
      withCredentials: true,
    });
  }

  delete<T>(path: string, queryParams?: Record<string, string | undefined>): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, {
      params: this.buildParams(queryParams),
      withCredentials: true,
    });
  }

  private buildParams(queryParams?: Record<string, string | undefined>): HttpParams {
    let params = new HttpParams();
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value);
        }
      }
    }
    return params;
  }
}
