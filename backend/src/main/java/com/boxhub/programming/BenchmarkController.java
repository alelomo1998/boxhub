package com.boxhub.programming;

import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/benchmarks")
public class BenchmarkController {

    private final BenchmarkTemplateRepository benchmarks;
    private final WodService wodService;
    private final BoxRepository boxes;

    public BenchmarkController(BenchmarkTemplateRepository benchmarks, WodService wodService, BoxRepository boxes) {
        this.benchmarks = benchmarks;
        this.wodService = wodService;
        this.boxes = boxes;
    }

    public record BenchmarkDto(UUID id, String name, String kind, String scoreType, Integer timeCapSeconds,
                               String bodyText, String timingPreset, WodJson.Blocks blocks) {}

    // Two things this endpoint used to leave to the caller, and neither can be:
    //  - loads are stored in lb, but the endpoint serves ONE box, so it answers in that box's unit;
    //  - timingPreset is derived from scoreType, which only /library did -- so the same benchmark
    //    read "Girl · For time" on the Library page and "Girl" in the class picker.
    // Both mirror WodService.benchmarkDto, which is what LibraryController already calls.
    private BenchmarkDto toDto(BenchmarkTemplate t, String weightUnit) {
        return new BenchmarkDto(t.getId(), t.getName(), t.getKind(), t.getScoreType(), t.getTimeCapSeconds(),
                t.getBodyText(), WodService.derivedTimingPreset(t.getScoreType()),
                wodService.deserialize(wodService.benchmarkBlocks(t, weightUnit)));
    }

    @GetMapping
    public List<BenchmarkDto> list(@RequestParam(required = false) String kind) {
        String weightUnit = currentBoxWeightUnit();
        List<BenchmarkTemplate> found = kind == null
                ? benchmarks.findAllByOrderByKindAscNameAsc()
                : benchmarks.findByKindOrderByNameAsc(kind);
        return found.stream().map(t -> toDto(t, weightUnit)).toList();
    }

    @GetMapping("/{id}")
    public BenchmarkDto get(@PathVariable UUID id) {
        BenchmarkTemplate t = benchmarks.findById(id).orElseThrow(NoSuchElementException::new);
        return toDto(t, currentBoxWeightUnit());
    }

    private String currentBoxWeightUnit() {
        Box box = boxes.findById(TenantContext.requireBoxId()).orElseThrow();
        return box.getWeightUnit();
    }

    @PostMapping("/{id}/clone")
    @ResponseStatus(HttpStatus.CREATED)
    public WodController.WodDto clone(@PathVariable UUID id) {
        RoleGuard.requireStaff();
        return wodService.toDto(wodService.cloneFromBenchmark(id, true));
    }
}
