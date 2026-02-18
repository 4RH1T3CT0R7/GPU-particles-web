use glam::Vec3;

/// Uniform spatial hash grid for O(1) neighbor queries.
///
/// Uses counting sort for O(N) construction: count particles per cell -> prefix sum -> scatter.
#[allow(dead_code)]
pub struct SpatialHashGrid {
    cell_size: f32,
    inv_cell_size: f32,
    table_size: usize,
    /// Count array (reused): cell_count[hash] = number of particles in cell
    cell_count: Vec<u32>,
    /// Prefix sum: cell_start[hash] = index where particles for this cell begin in sorted_indices
    cell_start: Vec<u32>,
    /// Particle indices sorted by cell hash
    sorted_indices: Vec<u32>,
    /// Cell hash per particle (used during build)
    particle_hashes: Vec<u32>,
}

impl SpatialHashGrid {
    /// Create grid with given cell size and max particle capacity.
    /// cell_size should be >= 2 * max_particle_radius (default: 0.2)
    /// table_size default: 131072 (2^17)
    pub fn new(cell_size: f32, table_size: usize, max_particles: usize) -> Self {
        Self {
            cell_size,
            inv_cell_size: 1.0 / cell_size,
            table_size,
            cell_count: vec![0u32; table_size],
            cell_start: vec![0u32; table_size],
            sorted_indices: vec![0u32; max_particles],
            particle_hashes: vec![0u32; max_particles],
        }
    }

    /// Build the grid from current positions.
    /// O(N) using counting sort.
    pub fn build(&mut self, positions: &[Vec3], count: usize) {
        // 1. Clear cell_count
        for v in self.cell_count.iter_mut() {
            *v = 0;
        }

        // 2. For each particle, compute cell hash, store it, and increment count
        for i in 0..count {
            let (cx, cy, cz) = self.cell_coords(positions[i]);
            let h = self.hash_cell(cx, cy, cz);
            self.particle_hashes[i] = h as u32;
            self.cell_count[h] += 1;
        }

        // 3. Prefix sum on cell_count -> cell_start
        self.cell_start[0] = 0;
        for k in 1..self.table_size {
            self.cell_start[k] = self.cell_start[k - 1] + self.cell_count[k - 1];
        }

        // 4. Reset cell_count to 0 (reuse for scatter offsets)
        for v in self.cell_count.iter_mut() {
            *v = 0;
        }

        // 5. Scatter particles into sorted_indices
        for i in 0..count {
            let h = self.particle_hashes[i] as usize;
            let idx = self.cell_start[h] + self.cell_count[h];
            self.sorted_indices[idx as usize] = i as u32;
            self.cell_count[h] += 1;
        }
    }

    /// Query all neighbors within the given position's cell and its 26 neighbors (3x3x3).
    /// Calls `callback(particle_index)` for each particle found in those cells.
    /// The caller is responsible for distance checks.
    pub fn query_neighbors<F: FnMut(u32)>(&self, pos: Vec3, mut callback: F) {
        let (cx, cy, cz) = self.cell_coords(pos);
        for dx in -1..=1_i32 {
            for dy in -1..=1_i32 {
                for dz in -1..=1_i32 {
                    let h = self.hash_cell(cx + dx, cy + dy, cz + dz);
                    let start = self.cell_start[h] as usize;
                    let end = start + self.cell_count[h] as usize;
                    for idx in start..end {
                        callback(self.sorted_indices[idx]);
                    }
                }
            }
        }
    }

    /// Hash function: cell coords -> table index
    #[inline]
    fn hash_cell(&self, cx: i32, cy: i32, cz: i32) -> usize {
        let h = (cx as u32)
            .wrapping_mul(73856093)
            ^ (cy as u32).wrapping_mul(19349663)
            ^ (cz as u32).wrapping_mul(83492791);
        (h as usize) % self.table_size
    }

    /// Convert world position to cell coordinates
    #[inline]
    fn cell_coords(&self, pos: Vec3) -> (i32, i32, i32) {
        (
            (pos.x * self.inv_cell_size).floor() as i32,
            (pos.y * self.inv_cell_size).floor() as i32,
            (pos.z * self.inv_cell_size).floor() as i32,
        )
    }
}
