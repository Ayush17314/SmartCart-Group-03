"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, ShieldAlert, CheckCircle2, EyeOff, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Review } from "@/lib/types";
import { toast } from "sonner";

function ReviewsAdmin() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["admin-reviews", status, page],
    queryFn: () =>
      api.adminReviews(
        new URLSearchParams({ page: String(page), limit: "50", status }).toString()
      ),
  });

  const moderate = useMutation({
    mutationFn: ({
      review,
      action,
    }: {
      review: Review;
      action: "APPROVED" | "HIDDEN" | "REMOVED";
    }) => {
      const userReason = reason[review._id]?.trim();
      const finalReason =
        userReason ||
        (action === "APPROVED"
          ? "Approved by store moderator"
          : action === "HIDDEN"
          ? "Hidden by store moderator"
          : "Removed due to violation of review guidelines");
      return api.moderateReview(review._id, action, finalReason);
    },
    onSuccess: () => {
      toast.success("Review moderation action saved");
      void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
    onError: (error) => toast.error(error.message || "Could not update review"),
  });

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Content Moderation</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          Customer Reviews Moderation
        </h1>
        <p className="mt-1 text-xs text-ink/60">
          Review customer feedback, address community spam or flags, and approve verified testimonials.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <label htmlFor="filter-review-status" className="text-xs font-semibold uppercase text-ink/60">
          Filter by Status:
        </label>
        <select
          id="filter-review-status"
          className="rounded-xl border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink outline-none dark:bg-zinc-900"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="PENDING">Pending Review</option>
          <option value="REPORTED">Flagged / Reported</option>
          <option value="APPROVED">Approved</option>
          <option value="HIDDEN">Hidden</option>
          <option value="REMOVED">Removed</option>
        </select>
      </div>

      {query.isLoading ? (
        <div className="skeleton h-72 rounded-2xl" />
      ) : query.isError ? (
        <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-800">
          Could not load reviews. Please refresh the page and try again.
        </div>
      ) : !query.data?.items.length ? (
        <div className="rounded-2xl border border-ink/10 bg-sand/30 p-12 text-center text-sm text-ink/60">
          No reviews found in this moderation category.
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {query.data.items.map((review) => (
              <article
                key={review._id}
                className="rounded-2xl border border-ink/10 bg-white p-5 shadow-2xs dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/5 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex text-amber-500">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={14}
                            className={
                              s <= review.rating ? "fill-amber-400 text-amber-400" : "text-ink/20"
                            }
                          />
                        ))}
                      </div>
                      <span className="font-bold text-ink text-sm">{review.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink/50">
                      By <span className="font-semibold text-ink/80">{review.userName}</span> • Product ID:{" "}
                      <span className="font-mono">{review.productId}</span> •{" "}
                      {new Date(review.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                      review.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-800"
                        : review.status === "PENDING"
                        ? "bg-amber-100 text-amber-800"
                        : review.status === "HIDDEN"
                        ? "bg-zinc-100 text-zinc-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {review.status}
                  </span>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-ink/80 whitespace-pre-wrap">
                  {review.body}
                </p>

                {Boolean(review.reportCount) && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                    <ShieldAlert size={16} className="shrink-0 text-amber-700 mt-0.5" />
                    <div>
                      <strong className="block">{review.reportCount} user report(s) flagged</strong>
                      {review.reports?.map((report, index) => (
                        <p key={`${report.userId}-${index}`} className="mt-0.5 text-amber-800/80">
                          • {report.reason}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {review.moderationReason && (
                  <p className="mt-2 text-[11px] text-ink/50">
                    Moderator Note: {review.moderationReason}
                  </p>
                )}

                {/* Moderation Controls */}
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink/5 pt-3">
                  <input
                    aria-label={`Moderation note for review ${review._id}`}
                    className="flex-1 min-w-[200px] rounded-xl border border-ink/15 bg-sand/20 px-3 py-1.5 text-xs text-ink outline-none focus:border-emerald-700"
                    value={reason[review._id] || ""}
                    maxLength={500}
                    onChange={(event) =>
                      setReason((current) => ({
                        ...current,
                        [review._id]: event.target.value,
                      }))
                    }
                    placeholder="Staff reason (optional, default will be used)..."
                  />

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-emerald-800 hover:bg-emerald-900 text-white text-xs h-8"
                      disabled={moderate.isPending}
                      onClick={() => moderate.mutate({ review, action: "APPROVED" })}
                    >
                      <CheckCircle2 size={13} className="mr-1" /> Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 text-ink/70"
                      disabled={moderate.isPending}
                      onClick={() => moderate.mutate({ review, action: "HIDDEN" })}
                    >
                      <EyeOff size={13} className="mr-1" /> Hide
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={moderate.isPending}
                      onClick={() => moderate.mutate({ review, action: "REMOVED" })}
                    >
                      <Trash2 size={13} className="mr-1" /> Remove
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between text-xs text-ink/60">
            <span>
              {query.data.pagination.total} reviews • Page {page} of {Math.max(query.data.pagination.pages, 1)}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((v) => v - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!query.data.pagination.hasNext}
                onClick={() => setPage((v) => v + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminReviewsPage() {
  return (
    <AdminShell permission="reviews.moderate">
      <ReviewsAdmin />
    </AdminShell>
  );
}
