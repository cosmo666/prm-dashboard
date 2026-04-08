using Microsoft.EntityFrameworkCore;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.PrmService.Data;

public class TenantDbContext : DbContext
{
    public TenantDbContext(DbContextOptions<TenantDbContext> options) : base(options) { }

    public DbSet<PrmServiceRecord> PrmServices => Set<PrmServiceRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<PrmServiceRecord>(entity =>
        {
            entity.ToTable("prm_services");
            entity.HasKey(e => e.RowId);

            entity.Property(e => e.RowId).HasColumnName("row_id");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Flight).HasColumnName("flight");
            entity.Property(e => e.FlightNumber).HasColumnName("flight_number");
            entity.Property(e => e.AgentName).HasColumnName("agent_name");
            entity.Property(e => e.AgentNo).HasColumnName("agent_no");
            entity.Property(e => e.PassengerName).HasColumnName("passenger_name");
            entity.Property(e => e.PrmAgentType).HasColumnName("prm_agent_type");
            entity.Property(e => e.StartTime).HasColumnName("start_time");
            entity.Property(e => e.PausedAt).HasColumnName("paused_at");
            entity.Property(e => e.EndTime).HasColumnName("end_time");
            entity.Property(e => e.Service).HasColumnName("service");
            entity.Property(e => e.SeatNumber).HasColumnName("seat_number");
            entity.Property(e => e.ScannedBy).HasColumnName("scanned_by");
            entity.Property(e => e.ScannedByUser).HasColumnName("scanned_by_user");
            entity.Property(e => e.Remarks).HasColumnName("remarks");
            entity.Property(e => e.PosLocation).HasColumnName("pos_location");
            entity.Property(e => e.NoShowFlag).HasColumnName("no_show_flag");
            entity.Property(e => e.LocName).HasColumnName("loc_name");
            entity.Property(e => e.Arrival).HasColumnName("arrival");
            entity.Property(e => e.Airline).HasColumnName("airline");
            entity.Property(e => e.EmpType).HasColumnName("emp_type");
            entity.Property(e => e.Departure).HasColumnName("departure");
            entity.Property(e => e.Requested).HasColumnName("requested");
            entity.Property(e => e.ServiceDate).HasColumnName("service_date");
        });
    }
}
