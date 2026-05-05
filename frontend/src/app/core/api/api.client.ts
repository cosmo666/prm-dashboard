import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  get<T>(path: string, params?: { [key: string]: string | string[] }): Observable<T> {
    return this.http.get<T>(this.base + path, {
      params: this.buildParams(params),
      withCredentials: true,
    });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.base + path, body, { withCredentials: true });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.base + path, { withCredentials: true });
  }

  private buildParams(params?: { [key: string]: string | string[] }): HttpParams {
    let httpParams = new HttpParams();
    if (!params) {
      return httpParams;
    }
    for (const key of Object.keys(params)) {
      const value = params[key];
      if (value === null || value === undefined) {
        continue;
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          continue;
        }
        httpParams = httpParams.set(key, value.join(','));
      } else {
        httpParams = httpParams.set(key, value);
      }
    }
    return httpParams;
  }
}
